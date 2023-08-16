import { isLocalhost, logger } from '../utils'
import { PostHog } from '../posthog-core'
import { DecideResponse, NetworkRequest } from '../types'

const PERFORMANCE_EVENTS_MAPPING: { [key: string]: number } = {
  // BASE_PERFORMANCE_EVENT_COLUMNS
  entryType: 0,
  timeOrigin: 1,
  name: 2,

  // RESOURCE_EVENT_COLUMNS
  startTime: 3,
  redirectStart: 4,
  redirectEnd: 5,
  workerStart: 6,
  fetchStart: 7,
  domainLookupStart: 8,
  domainLookupEnd: 9,
  connectStart: 10,
  secureConnectionStart: 11,
  connectEnd: 12,
  requestStart: 13,
  responseStart: 14,
  responseEnd: 15,
  decodedBodySize: 16,
  encodedBodySize: 17,
  initiatorType: 18,
  nextHopProtocol: 19,
  renderBlockingStatus: 20,
  responseStatus: 21,
  transferSize: 22,

  // LARGEST_CONTENTFUL_PAINT_EVENT_COLUMNS
  element: 23,
  renderTime: 24,
  loadTime: 25,
  size: 26,
  id: 27,
  url: 28,

  // NAVIGATION_EVENT_COLUMNS
  domComplete: 29,
  domContentLoadedEvent: 30,
  domInteractive: 31,
  loadEventEnd: 32,
  loadEventStart: 33,
  redirectCount: 34,
  navigationType: 35,
  unloadEventEnd: 36,
  unloadEventStart: 37,

  duration: 39,
  timestamp: 40,

  // NOTE: CURRENTLY UNSUPPORTED
  // EVENT_TIMING_EVENT_COLUMNS
  // processingStart: null,
  // processingEnd: null,

  // MARK_AND_MEASURE_EVENT_COLUMNS
  // detail: null,
}

const ENTRY_TYPES_TO_OBSERVE = [
  // 'event', // 涵盖了所有浏览器事件
  'first-input',
  // 'mark', // Mark 使用过于随意。 需要过滤特定标记
  // 'measure', // Measure 使用过于宽松。 我们需要筛选具体措施
  'navigation',
  'paint',
  'resource',
]

const PERFORMANCE_INGESTION_ENDPOINT = '/e/'
// 不要监视 posthog 路径，因为事件会导致性能事件 😱
const POSTHOG_PATHS_TO_IGNORE = ['/s/', PERFORMANCE_INGESTION_ENDPOINT]

export class WebPerformanceObserver {
  instance: PostHog
  remoteEnabled: boolean | undefined
  observer: PerformanceObserver | undefined
  _forceAllowLocalhost = false

  constructor(instance: PostHog) {
    this.instance = instance
  }

  startObservingIfEnabled() {
    if (this.isEnabled()) {
      this.startObserving()
    } else {
      this.stopObserving()
    }
  }

  startObserving() {
    if (this.observer) {
      return
    }

    if (window?.PerformanceObserver?.supportedEntryTypes === undefined) {
      logger.log(
        'PostHog Performance observer not started because PerformanceObserver is not supported by this browser.'
      )
      return
    }

    if (isLocalhost() && !this._forceAllowLocalhost) {
      logger.log('PostHog Peformance observer not started because we are on localhost.')
      return
    }

    try {
      // eslint-disable-next-line compat/compat
      this.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this._capturePerformanceEvent(entry)
        })
      })

      // eslint-disable-next-line compat/compat
      const entryTypes = PerformanceObserver.supportedEntryTypes.filter((x) => ENTRY_TYPES_TO_OBSERVE.includes(x))

      entryTypes.forEach((entryType) => {
        this.observer?.observe({ type: entryType, buffered: true })
      })
    } catch (e) {
      console.error('PostHog failed to start performance observer', e)
      this.stopObserving()
    }
  }

  stopObserving() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = undefined
    }
  }

  isObserving() {
    return !!this.observer
  }

  isEnabled() {
    return this.instance.get_config('capture_performance') ?? this.remoteEnabled ?? false
  }

  afterDecideResponse(response: DecideResponse) {
    this.remoteEnabled = response.capturePerformance || false
    if (this.isEnabled()) {
      this.startObserving()
    }
  }

  _capturePerformanceEvent(event: PerformanceEntry) {
    // NOTE: We don't want to capture our own request events.
    if (event.name.indexOf(this.instance.get_config('api_host')) === 0) {
      const path = event.name.replace(this.instance.get_config('api_host'), '')

      if (POSTHOG_PATHS_TO_IGNORE.find((x) => path.indexOf(x) === 0)) {
        return
      }
    }

    let networkRequest: NetworkRequest | null | undefined = {
      url: event.name,
    }

    const userSessionRecordingOptions = this.instance.get_config('session_recording')

    if (userSessionRecordingOptions.maskNetworkRequestFn) {
      networkRequest = userSessionRecordingOptions.maskNetworkRequestFn(networkRequest)
    }

    if (!networkRequest) {
      return
    }

    const eventJson = event.toJSON()
    eventJson.name = networkRequest.url
    const properties: { [key: number]: any } = {}
    // eslint-disable-next-line compat/compat
    const timeOrigin = Math.floor(Date.now() - performance.now())
    properties[PERFORMANCE_EVENTS_MAPPING['timeOrigin']] = timeOrigin
    properties[PERFORMANCE_EVENTS_MAPPING['timestamp']] = Math.floor(timeOrigin + event.startTime)
    for (const key in PERFORMANCE_EVENTS_MAPPING) {
      if (eventJson[key] !== undefined) {
        properties[PERFORMANCE_EVENTS_MAPPING[key]] = eventJson[key]
      }
    }

    this.capturePerformanceEvent(properties)

    if (exposesServerTiming(event)) {
      for (const timing of event.serverTiming || []) {
        this.capturePerformanceEvent({
          [PERFORMANCE_EVENTS_MAPPING['timeOrigin']]: timeOrigin,
          [PERFORMANCE_EVENTS_MAPPING['timestamp']]: Math.floor(timeOrigin + event.startTime),
          [PERFORMANCE_EVENTS_MAPPING['name']]: timing.name,
          [PERFORMANCE_EVENTS_MAPPING['duration']]: timing.duration,
          [PERFORMANCE_EVENTS_MAPPING['entryType']]: 'serverTiming',
        })
      }
    }
  }

  private capturePerformanceEvent(properties: { [key: number]: any }) {
    const timestamp = properties[PERFORMANCE_EVENTS_MAPPING['timestamp']]

    this.instance.sessionRecording?.onRRwebEmit({
      type: 6,
      data: {
        plugin: 'posthog/network@1',
        payload: properties,
      },
      timestamp,
    })

    // this.instance.capture('$performance_event', properties, {
    //     transport: 'XHR',
    //     method: 'POST',
    //     endpoint: PERFORMANCE_INGESTION_ENDPOINT,
    //     _noTruncate: true,
    //     _batchKey: 'performanceEvent',
    // })
  }
}

/**
 *  检查此 PerformanceEntry 是否是 PerformanceResourceTiming 或 PerformanceNavigationTiming
 *  NB PerformanceNavigationTiming 扩展了 PerformanceResourceTiming
 *  这里不关心它实现哪个接口，因为都暴露了 `serverTimings`
 */
const exposesServerTiming = (event: PerformanceEntry): event is PerformanceResourceTiming =>
  event.entryType === 'navigation' || event.entryType === 'resource'
