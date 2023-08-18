import {
  CONSOLE_LOG_RECORDING_ENABLED_SERVER_SIDE,
  SESSION_RECORDING_ENABLED_SERVER_SIDE,
  SESSION_RECORDING_RECORDER_VERSION_SERVER_SIDE,
} from '../constants'
import {
  ensureMaxMessageSize,
  FULL_SNAPSHOT_EVENT_TYPE,
  INCREMENTAL_SNAPSHOT_EVENT_TYPE,
  META_EVENT_TYPE,
  MutationRateLimiter,
  recordOptions,
  rrwebRecord,
  truncateLargeConsoleLogs,
} from './sessionrecording-utils'
import { PostHog } from '../posthog-core'
import { DecideResponse, Properties } from '../types'
import type { eventWithTime, listenerHandler } from '@rrweb/types'
import Config from '../config'
import { logger, loadScript, _timestamp } from '../utils'

const BASE_ENDPOINT = '/s/'

export const RECORDING_IDLE_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000
export const RECORDING_MAX_EVENT_SIZE = 1024 * 1024 * 0.9
export const RECORDING_BUFFER_TIMEOUT = 2000
export const SESSION_RECORDING_BATCH_KEY = 'sessionRecording'

enum IncrementalSource {
  Mutation = 0,
  MouseMove = 1,
  MouseInteraction = 2,
  Scroll = 3,
  ViewportResize = 4,
  Input = 5,
  TouchMove = 6,
  MediaInteraction = 7,
  StyleSheetRule = 8,
  CanvasMutation = 9,
  Font = 10,
  Log = 11,
  Drag = 12,
  StyleDeclaration = 13,
  Selection = 14,
  AdoptedStyleSheet = 15,
}

const ACTIVE_SOURCES = [
  IncrementalSource.MouseMove,
  IncrementalSource.MouseInteraction,
  IncrementalSource.Scroll,
  IncrementalSource.ViewportResize,
  IncrementalSource.Input,
  IncrementalSource.TouchMove,
  IncrementalSource.MediaInteraction,
  IncrementalSource.Drag,
]

export class SessionRecording {
  private instance: PostHog
  private emit: boolean
  private endpoint: string
  private windowId: string | null
  private sessionId: string | null
  private lastActivityTimestamp: number = Date.now()
  private flushBufferTimer?: any
  private buffer?: {
    size: number
    data: any[]
    sessionId: string | null
    windowId: string | null
  }
  private mutationRateLimiter?: MutationRateLimiter

  captureStarted: boolean
  snapshots: any[]
  stopRrweb: listenerHandler | undefined
  receivedDecide: boolean
  rrwebRecord: rrwebRecord | undefined
  recorderVersion?: string
  isIdle = false

  constructor(instance: PostHog) {
    this.instance = instance
    this.captureStarted = false
    this.snapshots = []
    this.emit = false
    this.endpoint = BASE_ENDPOINT
    this.stopRrweb = undefined
    this.windowId = null
    this.sessionId = null
    this.receivedDecide = false

    window.addEventListener('beforeunload', () => {
      this._flushBuffer()
    })
  }

  startRecordingIfEnabled() {
    if (this.isRecordingEnabled()) {
      this.startCaptureAndTrySendingQueuedSnapshots()
    } else {
      this.stopRecording()
    }
  }

  started() {
    return this.captureStarted
  }

  stopRecording() {
    if (this.captureStarted && this.stopRrweb) {
      this.stopRrweb()
      this.stopRrweb = undefined
      this.captureStarted = false
    }
  }

  isRecordingEnabled() {
    const enabled_server_side = !!this.instance.get_property(SESSION_RECORDING_ENABLED_SERVER_SIDE)
    const enabled_client_side = !this.instance.get_config('disable_session_recording')
    return enabled_server_side && enabled_client_side
  }

  isConsoleLogCaptureEnabled() {
    const enabled_server_side = !!this.instance.get_property(CONSOLE_LOG_RECORDING_ENABLED_SERVER_SIDE)
    const enabled_client_side = this.instance.get_config('enable_recording_console_log')
    return enabled_client_side ?? enabled_server_side
  }

  getRecordingVersion() {
    const recordingVersion_server_side = this.instance.get_property(SESSION_RECORDING_RECORDER_VERSION_SERVER_SIDE)
    const recordingVersion_client_side = this.instance.get_config('session_recording')?.recorderVersion
    return recordingVersion_client_side || recordingVersion_server_side || 'v1'
  }

  afterDecideResponse(response: DecideResponse) {
    this.receivedDecide = true
    if (this.instance.persistence) {
      this.instance.persistence.register({
        [SESSION_RECORDING_ENABLED_SERVER_SIDE]: !!response['sessionRecording'],
        [CONSOLE_LOG_RECORDING_ENABLED_SERVER_SIDE]: response.sessionRecording?.consoleLogRecordingEnabled,
        [SESSION_RECORDING_RECORDER_VERSION_SERVER_SIDE]: response.sessionRecording?.recorderVersion,
      })
    }
    if (response.sessionRecording?.endpoint) {
      this.endpoint = response.sessionRecording?.endpoint
    }

    if (response.sessionRecording?.recorderVersion) {
      this.recorderVersion = response.sessionRecording.recorderVersion
    }
    this.startRecordingIfEnabled()
  }

  log(message: string, level: 'log' | 'warn' | 'error' = 'log') {
    this.instance.sessionRecording?.onRRwebEmit({
      type: 6,
      data: {
        plugin: 'rrweb/console@1',
        payload: {
          level,
          trace: [],
          payload: [JSON.stringify(message)],
        },
      },
      timestamp: _timestamp(),
    })
  }

  private startCaptureAndTrySendingQueuedSnapshots() {
    if (this.receivedDecide) {
      this.emit = true
      this.snapshots.forEach((properties) => this._captureSnapshotBuffered(properties))
    }
    this._startCapture()
  }

  private _startCapture() {
    if (typeof Object.assign === 'undefined') {
      return
    }

    if (this.captureStarted || this.instance.get_config('disable_session_recording')) {
      return
    }

    this.captureStarted = true
    this.instance.sessionManager.checkAndGetSessionAndWindowId()

    const recorderJS = this.getRecordingVersion() === 'v2' ? 'recorder-v2.js' : 'recorder.js'

    if (this.instance.__loaded_recorder_version !== this.getRecordingVersion()) {
      loadScript(this.instance.get_config('api_host') + `/static/${recorderJS}?v=${Config.LIB_VERSION}`, (err) => {
        if (err) {
          return logger.error(`Could not load ${recorderJS}`, err)
        }

        this._onScriptLoaded()
      })
    } else {
      this._onScriptLoaded()
    }
  }

  private _isInteractiveEvent(event: eventWithTime) {
    return event.type === INCREMENTAL_SNAPSHOT_EVENT_TYPE && ACTIVE_SOURCES.indexOf(event.data?.source) !== -1
  }

  private _updateWindowAndSessionIds(event: eventWithTime) {
    const isUserInteraction = this._isInteractiveEvent(event)

    if (!isUserInteraction && !this.isIdle) {
      if (event.timestamp - this.lastActivityTimestamp > RECORDING_IDLE_ACTIVITY_TIMEOUT_MS) {
        this.isIdle = true
      }
    }

    if (isUserInteraction) {
      this.lastActivityTimestamp = event.timestamp
      if (this.isIdle) {
        this.isIdle = false
        this._tryTakeFullSnapshot()
      }
    }

    if (this.isIdle) {
      return
    }

    const { windowId, sessionId } = this.instance.sessionManager.checkAndGetSessionAndWindowId(
      !isUserInteraction,
      event.timestamp
    )

    if (
      [FULL_SNAPSHOT_EVENT_TYPE, META_EVENT_TYPE].indexOf(event.type) === -1 &&
      (this.windowId !== windowId || this.sessionId !== sessionId)
    ) {
      this._tryTakeFullSnapshot()
    }
    this.windowId = windowId
    this.sessionId = sessionId
  }

  private _tryTakeFullSnapshot(): boolean {
    if (!this.captureStarted) {
      return false
    }
    try {
      this.rrwebRecord?.takeFullSnapshot()
      return true
    } catch (e) {
      logger.error('Error taking full snapshot.', e)
      return false
    }
  }

  private _onScriptLoaded() {
    const sessionRecordingOptions: recordOptions<eventWithTime> = {
      blockClass: 'ph-no-capture',
      blockSelector: undefined,
      ignoreClass: 'ph-ignore-input',
      maskTextClass: 'ph-mask',
      maskTextSelector: undefined,
      maskTextFn: undefined,
      maskAllInputs: true,
      maskInputOptions: {},
      maskInputFn: undefined,
      slimDOMOptions: {},
      collectFonts: false,
      inlineStylesheet: true,
      recordCrossOriginIframes: false,
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.rrwebRecord = window.rrweb ? window.rrweb.record : window.rrwebRecord

    const userSessionRecordingOptions = this.instance.get_config('session_recording')
    for (const [key, value] of Object.entries(userSessionRecordingOptions || {})) {
      if (key in sessionRecordingOptions) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        sessionRecordingOptions[key] = value
      }
    }

    if (!this.rrwebRecord) {
      logger.error('出现啦一些问题，请检查程序是否正常，或者稍后再试。')
      return
    }

    this.mutationRateLimiter =
      this.mutationRateLimiter ??
      new MutationRateLimiter(this.rrwebRecord!, {
        onBlockedNode: (id, node) => {
          const message = `Too many mutations on node '${id}'. Rate limiting. This could be due to SVG animations or something similar`
          logger.log(message, {
            node: node,
          })

          this.log('[PostHog Recorder] ' + message, 'warn')
        },
      })

    this.stopRrweb = this.rrwebRecord({
      emit: (event) => {
        this.onRRwebEmit(event)
      },
      plugins:
        (window as any).rrwebConsoleRecord && this.isConsoleLogCaptureEnabled()
          ? [(window as any).rrwebConsoleRecord.getRecordConsolePlugin()]
          : [],
      ...sessionRecordingOptions,
    })

    this.instance._addCaptureHook((eventName) => {
      try {
        if (eventName === '$pageview') {
          this.rrwebRecord?.addCustomEvent('$pageview', { href: window.location.href })
        }
      } catch (e) {
        logger.error('Could not add $pageview to rrweb session', e)
      }
    })

    this.lastActivityTimestamp = Date.now()
    this.isIdle = false
  }

  onRRwebEmit(rawEvent: eventWithTime) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return
    }

    const throttledEvent = this.mutationRateLimiter ? this.mutationRateLimiter.throttleMutations(rawEvent) : rawEvent

    if (!throttledEvent) {
      return
    }

    const { event, size } = ensureMaxMessageSize(truncateLargeConsoleLogs(throttledEvent))

    this._updateWindowAndSessionIds(event)

    if (this.isIdle) {
      return
    }

    const properties = {
      $snapshot_bytes: size,
      $snapshot_data: event,
      $session_id: this.sessionId,
      $window_id: this.windowId,
    }

    if (this.emit) {
      this._captureSnapshotBuffered(properties)
    } else {
      this.snapshots.push(properties)
    }
  }

  private _flushBuffer() {
    if (this.flushBufferTimer) {
      clearTimeout(this.flushBufferTimer)
      this.flushBufferTimer = undefined
    }

    if (this.buffer && this.buffer.data.length !== 0) {
      this._captureSnapshot({
        $snapshot_bytes: this.buffer.size,
        $snapshot_data: this.buffer.data,
        $session_id: this.buffer.sessionId,
        $window_id: this.buffer.windowId,
      })
    }

    this.buffer = undefined

    return {
      size: 0,
      data: [],
      sessionId: this.sessionId,
      windowId: this.windowId,
    }
  }

  private _captureSnapshotBuffered(properties: Properties) {
    const additionalBytes = 2 + (this.buffer?.data.length || 0)
    if (
      !this.buffer ||
      this.buffer.size + properties.$snapshot_bytes + additionalBytes > RECORDING_MAX_EVENT_SIZE ||
      this.buffer.sessionId !== this.sessionId
    ) {
      this.buffer = this._flushBuffer()
    }

    this.buffer.size += properties.$snapshot_bytes
    this.buffer.data.push(properties.$snapshot_data)

    if (!this.flushBufferTimer) {
      this.flushBufferTimer = setTimeout(() => {
        this._flushBuffer()
      }, RECORDING_BUFFER_TIMEOUT)
    }
  }

  private _captureSnapshot(properties: Properties) {
    this.instance.capture('$snapshot', properties, {
      transport: 'XHR',
      method: 'POST',
      endpoint: this.endpoint,
      _noTruncate: true,
      _batchKey: SESSION_RECORDING_BATCH_KEY,
      _metrics: {
        rrweb_full_snapshot: properties.$snapshot_data.type === FULL_SNAPSHOT_EVENT_TYPE,
      },
    })
  }
}
