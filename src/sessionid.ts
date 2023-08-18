import { PostHogPersistence } from './posthog-persistence'
import { SESSION_ID } from './constants'
import { sessionStore } from './storage'
import { PostHogConfig, SessionIdChangedCallback } from './types'
import { uuidv7 } from './uuidv7'

const MAX_SESSION_IDLE_TIMEOUT = 30 * 60
const MIN_SESSION_IDLE_TIMEOUT = 60
const SESSION_LENGTH_LIMIT = 24 * 3600 * 1000

export class SessionIdManager {
  private config: Partial<PostHogConfig>
  private persistence: PostHogPersistence
  private _windowId: string | null | undefined
  private _sessionId: string | null | undefined
  private _window_id_storage_key: string
  private _primary_window_exists_storage_key: string
  private _sessionStartTimestamp: number | null
  private _sessionActivityTimestamp: number | null
  private _sessionTimeoutMs: number
  private _sessionIdChangedHandlers: SessionIdChangedCallback[] = []

  constructor(config: Partial<PostHogConfig>, persistence: PostHogPersistence) {
    this.config = config
    this.persistence = persistence
    this._windowId = undefined
    this._sessionId = undefined
    this._sessionStartTimestamp = null
    this._sessionActivityTimestamp = null

    const persistenceName = config['persistence_name'] || config['token']
    let desiredTimeout = config['session_idle_timeout_seconds'] || MAX_SESSION_IDLE_TIMEOUT

    if (typeof desiredTimeout !== 'number') {
      desiredTimeout = MAX_SESSION_IDLE_TIMEOUT
    } else if (desiredTimeout > MAX_SESSION_IDLE_TIMEOUT) {
      console.warn(desiredTimeout > MAX_SESSION_IDLE_TIMEOUT)
    } else if (desiredTimeout < MIN_SESSION_IDLE_TIMEOUT) {
      console.warn(desiredTimeout < MIN_SESSION_IDLE_TIMEOUT)
    }

    this._sessionTimeoutMs =
      Math.min(Math.max(desiredTimeout, MIN_SESSION_IDLE_TIMEOUT), MAX_SESSION_IDLE_TIMEOUT) * 1000
    this._window_id_storage_key = 'ph_' + persistenceName + '_window_id'
    this._primary_window_exists_storage_key = 'ph_' + persistenceName + '_primary_window_exists'

    if (this._canUseSessionStorage()) {
      const lastWindowId = sessionStore.parse(this._window_id_storage_key)

      const primaryWindowExists = sessionStore.parse(this._primary_window_exists_storage_key)
      if (lastWindowId && !primaryWindowExists) {
        this._windowId = lastWindowId
      } else {
        sessionStore.remove(this._window_id_storage_key)
      }
      sessionStore.set(this._primary_window_exists_storage_key, true)
    }

    this._listenToReloadWindow()
  }

  onSessionId(callback: SessionIdChangedCallback): () => void {
    if (this._sessionIdChangedHandlers === undefined) {
      this._sessionIdChangedHandlers = []
    }

    this._sessionIdChangedHandlers.push(callback)
    if (this._sessionId) {
      callback(this._sessionId, this._windowId)
    }
    return () => {
      this._sessionIdChangedHandlers = this._sessionIdChangedHandlers.filter((h) => h !== callback)
    }
  }

  private _canUseSessionStorage(): boolean {
    return this.config.persistence !== 'memory' && !this.persistence.disabled && sessionStore.is_supported()
  }

  private _setWindowId(windowId: string): void {
    if (windowId !== this._windowId) {
      this._windowId = windowId
      if (this._canUseSessionStorage()) {
        sessionStore.set(this._window_id_storage_key, windowId)
      }
    }
  }

  private _getWindowId(): string | null {
    if (this._windowId) {
      return this._windowId
    }
    if (this._canUseSessionStorage()) {
      return sessionStore.parse(this._window_id_storage_key)
    }
    return null
  }

  private _setSessionId(
    sessionId: string | null,
    sessionActivityTimestamp: number | null,
    sessionStartTimestamp: number | null
  ): void {
    if (
      sessionId !== this._sessionId ||
      sessionActivityTimestamp !== this._sessionActivityTimestamp ||
      sessionStartTimestamp !== this._sessionStartTimestamp
    ) {
      this._sessionStartTimestamp = sessionStartTimestamp
      this._sessionActivityTimestamp = sessionActivityTimestamp
      this._sessionId = sessionId
      this.persistence.register({
        [SESSION_ID]: [sessionActivityTimestamp, sessionId, sessionStartTimestamp],
      })
    }
  }

  private _getSessionId(): [number, string, number] {
    if (this._sessionId && this._sessionActivityTimestamp && this._sessionStartTimestamp) {
      return [this._sessionActivityTimestamp, this._sessionId, this._sessionStartTimestamp]
    }
    const sessionId = this.persistence.props[SESSION_ID]

    if (Array.isArray(sessionId) && sessionId.length === 2) {
      sessionId.push(sessionId[0])
    }

    return sessionId || [0, null, 0]
  }

  resetSessionId(): void {
    this._setSessionId(null, null, null)
  }

  private _listenToReloadWindow(): void {
    window.addEventListener('beforeunload', () => {
      if (this._canUseSessionStorage()) {
        sessionStore.remove(this._primary_window_exists_storage_key)
      }
    })
  }

  checkAndGetSessionAndWindowId(readOnly = false, _timestamp: number | null = null) {
    const timestamp = _timestamp || new Date().getTime()

    // eslint-disable-next-line prefer-const
    let [lastTimestamp, sessionId, startTimestamp] = this._getSessionId()
    let windowId = this._getWindowId()

    const sessionPastMaximumLength =
      startTimestamp && startTimestamp > 0 && Math.abs(timestamp - startTimestamp) > SESSION_LENGTH_LIMIT

    let valuesChanged = false
    if (
      !sessionId ||
      (!readOnly && Math.abs(timestamp - lastTimestamp) > this._sessionTimeoutMs) ||
      sessionPastMaximumLength
    ) {
      sessionId = uuidv7()
      windowId = uuidv7()
      startTimestamp = timestamp
      valuesChanged = true
    } else if (!windowId) {
      windowId = uuidv7()
      valuesChanged = true
    }

    const newTimestamp = lastTimestamp === 0 || !readOnly || sessionPastMaximumLength ? timestamp : lastTimestamp
    const sessionStartTimestamp = startTimestamp === 0 ? new Date().getTime() : startTimestamp

    this._setWindowId(windowId)
    this._setSessionId(sessionId, newTimestamp, sessionStartTimestamp)

    if (valuesChanged) {
      this._sessionIdChangedHandlers.forEach((handler) => handler(sessionId, windowId))
    }

    return {
      sessionId,
      windowId,
      sessionStartTimestamp,
    }
  }
}
