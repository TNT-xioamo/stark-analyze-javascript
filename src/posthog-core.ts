import Config from './config'
import {
  _copyAndTruncateStrings,
  _each,
  _eachArray,
  _extend,
  _info,
  _isArray,
  _isBlockedUA,
  _isObject,
  _isUndefined,
  _register_event,
  _safewrap_class,
  _browser_properties,
  _window_ip,
  _register_event_handler,
  document,
  logger,
  userAgent,
  window,
} from './utils'
import { autocapture } from './autocapture'
import { PostHogFeatureFlags } from './posthog-featureflags'
import { PostHogPersistence } from './posthog-persistence'
import { ALIAS_ID_KEY, FLAG_CALL_REPORTED, PEOPLE_DISTINCT_ID_KEY } from './constants'
import { SessionRecording } from './extensions/sessionrecording'
import { WebPerformanceObserver } from './extensions/web-performance'
import { Decide } from './decide'
import { Toolbar } from './extensions/toolbar'
import { clearOptInOut, hasOptedIn, hasOptedOut, optIn, optOut, userOptedOut } from './gdpr-utils'
import { cookieStore, localStore, sessionStore } from './storage'
import { RequestQueue } from './request-queue'
import { compressData, decideCompression } from './compression'
import { addParamsToURL, xhr } from './send-request'
import { encodePostData } from 'encodePostData'
import { RetryQueue } from './retry-queue'
import { SessionIdManager } from './sessionid'
import {
  AutocaptureConfig,
  CaptureOptions,
  CaptureResult,
  Compression,
  EarlyAccessFeatureCallback,
  GDPROptions,
  isFeatureEnabledOptions,
  JSC,
  JsonType,
  OptInOutCapturingOptions,
  PostHogConfig,
  Properties,
  Property,
  RequestCallback,
  SessionIdChangedCallback,
  SnippetArrayItem,
  ToolbarParams,
  XHROptions,
} from './types'
import { SentryIntegration } from './extensions/sentry-integration'
import { createSegmentIntegration } from 'extensions/createSegmentIntegration'
import { PageViewIdManager } from './page-view-id'
import { ExceptionObserver } from './extensions/exceptions/exception-autocapture'
import { PostHogSurveys, SurveyCallback } from './posthog-surveys'
import { RateLimiter } from './rate-limiter'
import { uuidv7 } from './uuidv7'
import { pageViewDataManager, _page_hash_leave } from './page-view-storage'

enum InitType {
  INIT_MODULE = 0,
  INIT_SNIPPET = 1,
}

let init_type: InitType

let posthog_master: Record<string, PostHog> & {
  init: (token: string, config: Partial<PostHogConfig>, name: string) => void
}

// some globals for comparisons
const __NOOP = () => {}
const __NOOPTIONS = {}

const PRIMARY_INSTANCE_NAME = 'Stark'

const USE_XHR = window.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest()

let ENQUEUE_REQUESTS = !USE_XHR && userAgent.indexOf('MSIE') === -1 && userAgent.indexOf('Mozilla') === -1
/**
 * 埋点入口配置
 * @returns
 */

const defaultConfig = (): PostHogConfig => ({
  api_host: '',
  api_method: 'POST',
  api_transport: 'XHR',
  page_id: 'pageId',
  ui_host: null,
  token: '',
  platform_info: () => void 0,
  autocapture: true,
  rageclick: true,
  page_remain: true,
  cross_subdomain_cookie: document?.location?.hostname?.indexOf('xingliu.com') === -1,
  persistence: 'cookie',
  persistence_name: '',
  cookie_name: '',
  loaded: __NOOP,
  store_google: true,
  custom_campaign_params: [],
  save_referrer: true,
  test: false,
  verbose: false,
  capture_pageview: true,
  capture_pageleave: true,
  debug: false,
  cookie_expiration: 365,
  upgrade: false,
  disable_session_recording: false,
  disable_persistence: false,
  disable_cookie: false,
  enable_recording_console_log: undefined,
  secure_cookie: window?.location?.protocol === 'https:',
  ip: true,
  opt_out_capturing_by_default: false,
  opt_out_persistence_by_default: false,
  opt_out_capturing_persistence_type: 'localStorage',
  opt_out_capturing_cookie_prefix: null,
  opt_in_site_apps: false,
  property_blacklist: [],
  respect_dnt: false,
  sanitize_properties: null,
  xhr_headers: {}, // { header: value, header2: value }
  on_xhr_auth: () => void 0,
  inapp_protocol: '//',
  inapp_link_new_window: false,
  request_batching: true,
  properties_string_max_length: 65535,
  session_recording: {},
  mask_all_element_attributes: false,
  mask_all_text: false,
  mask_bg_img: true,
  advanced_disable_decide: false,
  advanced_disable_feature_flags: false,
  advanced_disable_feature_flags_on_first_load: false,
  advanced_disable_toolbar_metrics: false,
  on_xhr_error: (req) => {
    const error = `Bad HTTP status: ${req.status}  ${req.statusText}`
    console.error(error)
  },
  get_device_id: (uuid) => uuid,
  _onCapture: __NOOP,
  capture_performance: undefined,
  name: 'stark',
  callback_fn: 'stark._jsc',
  bootstrap: {},
  disable_compression: false,
  session_idle_timeout_seconds: 30 * 60,
})

const create_phlib = function (
  token: string,
  config?: Partial<PostHogConfig>,
  name?: string,
  createComplete?: (instance: PostHog) => void
): PostHog {
  let instance: PostHog
  const target =
    name === PRIMARY_INSTANCE_NAME || !posthog_master ? posthog_master : name ? posthog_master[name] : undefined
  const callbacksHandled = {
    initComplete: false,
    syncCode: false,
  }
  const handleCallback = (callbackName: keyof typeof callbacksHandled) => (instance: PostHog) => {
    if (!callbacksHandled[callbackName]) {
      callbacksHandled[callbackName] = true
      if (callbacksHandled.initComplete && callbacksHandled.syncCode) {
        createComplete?.(instance)
      }
    }
  }

  if (target && init_type === InitType.INIT_MODULE) {
    console.error('InitType.INIT_MODULE ' + name)
    instance = target as any
  } else {
    if (target && !_isArray(target)) {
      console.log('你已经初始化了 ' + name)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return
    }
    instance = new PostHog()
  }

  instance._init(token, config, name, handleCallback('initComplete'))
  instance.toolbar.maybeLoadToolbar()

  instance.sessionRecording = new SessionRecording(instance)
  instance.sessionRecording.startRecordingIfEnabled()

  instance.webPerformance = new WebPerformanceObserver(instance)
  instance.webPerformance.startObservingIfEnabled()

  instance.exceptionAutocapture = new ExceptionObserver(instance)

  instance.__autocapture = instance.get_config('autocapture')
  autocapture._setIsAutocaptureEnabled(instance)
  if (autocapture._isAutocaptureEnabled) {
    // if (!autocapture._isAutocaptureEnabled) {
    instance.__autocapture = instance.get_config('autocapture')
    const num_buckets = 100
    const num_enabled_buckets = 100
    if (!autocapture.enabledForProject(instance.get_config('token'), num_buckets, num_enabled_buckets)) {
      instance.__autocapture = false
    } else if (!autocapture.isBrowserSupported()) {
      instance.__autocapture = false
    } else {
      autocapture.init(instance)
    }
  }

  Config.DEBUG = Config.DEBUG || instance.get_config('debug')

  if (typeof target !== 'undefined' && _isArray(target)) {
    instance._execute_array.call(instance.people, (target as any).people)
    instance._execute_array(target)
  }

  handleCallback('syncCode')(instance)
  return instance
}

export class PostHog {
  __loaded: boolean
  __loaded_recorder_version: 'v1' | 'v2' | undefined
  config: PostHogConfig

  persistence: PostHogPersistence
  rateLimiter: RateLimiter
  sessionPersistence: PostHogPersistence
  sessionManager: SessionIdManager
  pageViewIdManager: PageViewIdManager
  featureFlags: PostHogFeatureFlags
  surveys: PostHogSurveys
  toolbar: Toolbar
  sessionRecording: SessionRecording | undefined
  webPerformance: WebPerformanceObserver | undefined
  exceptionAutocapture: ExceptionObserver | undefined

  _requestQueue: RequestQueue
  _retryQueue: RetryQueue

  _triggered_notifs: any
  compression: Partial<Record<Compression, boolean>>
  _jsc: JSC
  __captureHooks: ((eventName: string) => void)[]
  __request_queue: [url: string, data: Record<string, any>, options: XHROptions, callback?: RequestCallback][]
  __autocapture: boolean | AutocaptureConfig | undefined
  decideEndpointWasHit: boolean

  SentryIntegration: typeof SentryIntegration
  segmentIntegration: () => any

  people: {
    set: (prop: string | Properties, to?: string, callback?: RequestCallback) => void
    set_once: (prop: string | Properties, to?: string, callback?: RequestCallback) => void
  }

  constructor() {
    console.log(
      `Powered by %cStark联盟提供-技术支持%cv0.0.1%c\nPlease star & fork to support the author!`,
      'background-color: #1A55ED; padding: 7px; color: #fff;',
      'background-color: #FCBF23; color: #000; padding: 7px;',
      ''
    )
    this.config = defaultConfig()
    this.compression = {}
    this.decideEndpointWasHit = false
    this.SentryIntegration = SentryIntegration
    this.segmentIntegration = () => createSegmentIntegration(this)
    this.__captureHooks = []
    this.__request_queue = []
    this.__loaded = false
    this.__loaded_recorder_version = undefined
    this.__autocapture = undefined
    this._jsc = function () {} as JSC

    this.featureFlags = new PostHogFeatureFlags(this)
    this.toolbar = new Toolbar(this)
    this.pageViewIdManager = new PageViewIdManager()
    this.surveys = new PostHogSurveys(this)
    this.rateLimiter = new RateLimiter()

    this._requestQueue = undefined as any
    this._retryQueue = undefined as any
    this.persistence = undefined as any
    this.sessionPersistence = undefined as any
    this.sessionManager = undefined as any

    this.people = {
      set: (prop: string | Properties, to?: string, callback?: RequestCallback) => {
        const setProps = typeof prop === 'string' ? { [prop]: to } : prop
        this.setPersonProperties(setProps)
        callback?.({})
      },
      set_once: (prop: string | Properties, to?: string, callback?: RequestCallback) => {
        const setProps = typeof prop === 'string' ? { [prop]: to } : prop
        this.setPersonProperties(undefined, setProps)
        callback?.({})
      },
    }
  }

  /**
   *
   * @param {String} token
   * @param {Object} [config]
   * @param {String} [name]
   */
  init(token: string, config?: Partial<PostHogConfig>, name?: string): PostHog | void {
    if (_isUndefined(name)) return
    if (name === PRIMARY_INSTANCE_NAME) return

    const instance: PostHog = create_phlib(token, config, name, (instance: PostHog) => {
      posthog_master[name] = instance
      instance._loaded()
    })
    posthog_master[name] = instance

    return instance
  }

  _init(
    token: string,
    config: Partial<PostHogConfig> = {},
    name?: string,
    initComplete?: (instance: PostHog) => void
  ): void {
    this.__loaded = true
    this.config = {} as PostHogConfig
    this._triggered_notifs = []
    const callbacksHandled = { segmentRegister: false, syncCode: false }
    const updateInitComplete = (callbackName: keyof typeof callbacksHandled) => () => {
      if (!callbacksHandled[callbackName]) {
        callbacksHandled[callbackName] = true
        if (callbacksHandled.segmentRegister && callbacksHandled.syncCode) {
          initComplete?.(this)
        }
      }
    }

    this.set_config(
      _extend({}, defaultConfig(), config, {
        name: name,
        token: token,
        callback_fn: (name === PRIMARY_INSTANCE_NAME ? name : PRIMARY_INSTANCE_NAME + '.' + name) + '._jsc',
      })
    )

    this._jsc = function () {} as JSC

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (window?.rrweb?.record || window?.rrwebRecord) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.__loaded_recorder_version = window?.rrweb?.version
    }

    this.persistence = new PostHogPersistence(this.config)

    this._requestQueue = new RequestQueue(this._handle_queued_event.bind(this))
    this._retryQueue = new RetryQueue(this.get_config('on_xhr_error'), this.get_config('on_xhr_auth'), this.rateLimiter)
    this.__captureHooks = []
    this.__request_queue = []

    this.sessionManager = new SessionIdManager(this.config, this.persistence)
    this.sessionPersistence =
      this.config.persistence === 'sessionStorage'
        ? this.persistence
        : new PostHogPersistence({ ...this.config, persistence: 'sessionStorage' })

    this._gdpr_init()

    if (config.segment) {
      this.config.get_device_id = () => config.segment.user().anonymousId()

      if (config.segment.user().id()) {
        this.register({
          distinct_id: config.segment.user().id(),
        })
        this.persistence.set_user_state('identified')
      }

      config.segment.register(this.segmentIntegration()).then(updateInitComplete('segmentRegister'))
    } else {
      updateInitComplete('segmentRegister')()
    }

    if (config.bootstrap?.distinctID !== undefined) {
      const uuid = this.get_config('get_device_id')(uuidv7())
      const deviceID = config.bootstrap?.isIdentifiedID ? uuid : config.bootstrap.distinctID
      this.persistence.set_user_state(config.bootstrap?.isIdentifiedID ? 'identified' : 'anonymous')
      this.register({
        distinct_id: config.bootstrap.distinctID,
        $device_id: deviceID,
      })
    }

    if (this._hasBootstrappedFeatureFlags()) {
      const activeFlags = Object.keys(config.bootstrap?.featureFlags || {})
        .filter((flag) => !!config.bootstrap?.featureFlags?.[flag])
        .reduce(
          (res: Record<string, string | boolean>, key) => (
            (res[key] = config.bootstrap?.featureFlags?.[key] || false), res
          ),
          {}
        )
      const featureFlagPayloads = Object.keys(config.bootstrap?.featureFlagPayloads || {})
        .filter((key) => activeFlags[key])
        .reduce((res: Record<string, JsonType>, key) => {
          if (config.bootstrap?.featureFlagPayloads?.[key]) {
            res[key] = config.bootstrap?.featureFlagPayloads?.[key]
          }
          return res
        }, {})

      this.featureFlags.receivedFeatureFlags({ featureFlags: activeFlags, featureFlagPayloads })
    }

    if (!this.get_distinct_id()) {
      const uuid = this.get_config('get_device_id')(uuidv7())
      this.register_once(
        {
          distinct_id: uuid,
          $device_id: uuid,
        },
        ''
      )
      this.persistence.set_user_state('anonymous')
    }
    window.addEventListener &&
      window.addEventListener('onpagehide' in self ? 'pagehide' : 'unload', this._handle_unload.bind(this))
    if (this.get_config('page_remain')) {
      this._handle_hash_history()
      window.addEventListener && window.addEventListener('visibilitychange', this._handle_visibility_change.bind(this))
      // window.addEventListener && window.addEventListener('replacestate', this._handle_hash_change.bind(this), false)
      window.addEventListener && window.addEventListener('hashchange', this._handle_hash_change.bind(this), false)
      window.addEventListener && window.addEventListener('pushstate', this._handle_hash_change.bind(this), false)
    }
    updateInitComplete('syncCode')()
  }

  _loaded(): void {
    this.featureFlags.setReloadingPaused(true)

    try {
      this.get_config('loaded')(this)
    } catch (err) {
      console.error('`loaded` function failed', err)
    }

    this._start_queue_if_opted_in()

    if (this.get_config('capture_pageview')) {
      this.capture('$pageloaded', { $title: document.title }, { send_instantly: true })
    }
    if (!this.get_config('advanced_disable_decide')) {
      new Decide(this).call()
    }

    this.featureFlags.resetRequestQueue()
    this.featureFlags.setReloadingPaused(false)
  }

  _start_queue_if_opted_in(): void {
    if (!this.has_opted_out_capturing()) {
      if (this.get_config('request_batching')) {
        this._requestQueue.poll()
      }
    }
  }

  _dom_loaded(): void {
    if (!this.has_opted_out_capturing()) {
      _eachArray(this.__request_queue, (item) => {
        this._send_request(...item)
      })
    }

    this.__request_queue = []

    this._start_queue_if_opted_in()
  }

  _prepare_callback(callback?: RequestCallback, data?: Properties): RequestCallback | null | string {
    if (_isUndefined(callback)) {
      return null
    }

    if (USE_XHR) {
      return function (response) {
        callback(response, data)
      }
    } else {
      const jsc = this._jsc
      const randomized_cb = '' + Math.floor(Math.random() * 100000000)
      const callback_string = this.get_config('callback_fn') + '[' + randomized_cb + ']'
      jsc[randomized_cb] = function (response: any) {
        delete jsc[randomized_cb]
        callback(response, data)
      }
      return callback_string
    }
  }

  _handle_unload(): void {
    // event?.preventDefault()
    if (!this.get_config('request_batching')) {
      if (this.get_config('capture_pageview') && this.get_config('capture_pageleave')) {
        this.capture('$pageleave', null, { transport: 'sendBeacon' })
      }
      return
    }

    if (this.get_config('capture_pageview') && this.get_config('capture_pageleave')) {
      this.capture('$pageleave')
    }

    this._requestQueue.unload()
    this._retryQueue.unload()
  }

  _handle_visibility_change(): void {
    if (document.visibilityState == 'hidden') {
      this.capture('$pagehidden')
    } else {
      this.capture('$pageshow')
    }
  }

  _handle_hash_change(even: Event): void {
    const par = _page_hash_leave(even)
    par && this.capture('$pageleave', par)
  }

  _handle_hash_history(): void {
    const registerHistoryEventHandler = _register_event_handler(window.history)
    window.history.pushState = registerHistoryEventHandler('pushState')
    window.history.replaceState = registerHistoryEventHandler('replaceState')
  }

  _handle_queued_event(url: string, data: Record<string, any>, options?: XHROptions): void {
    const jsonData = JSON.stringify(data)
    this.__compress_and_send_json_request(url, jsonData, options || __NOOPTIONS, __NOOP)
  }

  __compress_and_send_json_request(url: string, jsonData: any, options: XHROptions, callback?: RequestCallback): void {
    const [data, _options] = compressData(decideCompression(this.compression), jsonData, options)
    console.log('__compress_and_send_json_request', jsonData)
    this._send_request(url, jsonData, _options, callback)
  }

  _send_request(url: string, data: Record<string, any>, options: CaptureOptions, callback?: RequestCallback): void {
    if (this.rateLimiter.isRateLimited(options._batchKey)) {
      if (this.get_config('debug')) {
        console.warn('配额有限。 放弃请求。')
      }
      return
    }

    if (ENQUEUE_REQUESTS) {
      this.__request_queue.push([url, data, options, callback])
      return
    }

    const DEFAULT_OPTIONS = {
      method: this.get_config('api_method'),
      transport: this.get_config('api_transport'),
      verbose: this.get_config('verbose'),
    }

    options = _extend(DEFAULT_OPTIONS, options || {})
    if (!USE_XHR) {
      options.method = 'GET'
    }

    const useSendBeacon = 'sendBeacon' in window.navigator && options.transport === 'sendBeacon'
    url = addParamsToURL(url, options.urlQueryArgs || {}, {
      ip: this.get_config('ip'),
    })

    if (useSendBeacon) {
      try {
        window.navigator.sendBeacon(url, encodePostData(data, { ...options, sendBeacon: true }))
      } catch (e) {}
    } else if (USE_XHR) {
      try {
        xhr({
          url: url,
          data: data,
          headers: this.get_config('xhr_headers'),
          options: options,
          callback,
          retriesPerformedSoFar: 0,
          retryQueue: this._retryQueue,
          onXHRError: this.get_config('on_xhr_error'),
          onXHRAuth: this.get_config('on_xhr_auth'),
          onRateLimited: this.rateLimiter.on429Response,
        })
      } catch (e) {
        console.error(e)
      }
    } else {
      const script = document.createElement('script')
      script.type = 'text/javascript'
      script.async = true
      script.defer = true
      script.src = url
      const s = document.getElementsByTagName('script')[0]
      s.parentNode?.insertBefore(script, s)
    }
  }

  /**
   * @param {Array} array
   */
  _execute_array(array: SnippetArrayItem[]): void {
    let fn_name
    const alias_calls: SnippetArrayItem[] = []
    const other_calls: SnippetArrayItem[] = []
    const capturing_calls: SnippetArrayItem[] = []
    _eachArray(array, (item) => {
      if (item) {
        fn_name = item[0]
        if (_isArray(fn_name)) {
          capturing_calls.push(item)
        } else if (typeof item === 'function') {
          ;(item as any).call(this)
        } else if (_isArray(item) && fn_name === 'alias') {
          alias_calls.push(item)
        } else if (
          _isArray(item) &&
          fn_name.indexOf('capture') !== -1 &&
          typeof (this as any)[fn_name] === 'function'
        ) {
          capturing_calls.push(item)
        } else {
          other_calls.push(item)
        }
      }
    })

    const execute = function (calls: SnippetArrayItem[], thisArg: any) {
      _eachArray(
        calls,
        function (item) {
          if (_isArray(item[0])) {
            let caller = thisArg
            _each(item, function (call) {
              caller = caller[call[0]].apply(caller, call.slice(1))
            })
          } else {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this[item[0]].apply(this, item.slice(1))
          }
        },
        thisArg
      )
    }

    execute(alias_calls, this)
    execute(other_calls, this)
    execute(capturing_calls, this)
  }

  _hasBootstrappedFeatureFlags(): boolean {
    return (this.config.bootstrap?.featureFlags && Object.keys(this.config.bootstrap?.featureFlags).length > 0) || false
  }

  /**
   * @param {Array} item
   */
  push(item: SnippetArrayItem): void {
    this._execute_array([item])
  }

  /**/
  captureException(exception: Error, properties?: Properties): void {
    this.exceptionAutocapture?.captureException(
      [exception.name, undefined, undefined, undefined, exception],
      properties
    )
  }

  /**
   * @param {String} event_name
   * @param {Object} [properties]
   * @param {Object} [options]
   * @param {String} [options.transport]
   * @param {Date} [options.timestamp]
   */
  capture(
    event_name: string,
    properties?: Properties | null,
    options: CaptureOptions = __NOOPTIONS
  ): CaptureResult | void {
    if (!this.__loaded) {
      return
    }

    if (userOptedOut(this, false)) {
      return
    }
    options = options || __NOOPTIONS
    const transport = options['transport']
    if (transport) {
      options.transport = transport
    }

    if (_isUndefined(event_name) || typeof event_name !== 'string') {
      console.error('没有向 capture 提供事件名称')
      return
    }

    if (_isBlockedUA(userAgent)) {
      return
    }

    this.sessionPersistence.update_search_keyword()

    if (this.get_config('store_google')) {
      this.sessionPersistence.update_campaign_params()
    }
    if (this.get_config('save_referrer')) {
      this.sessionPersistence.update_referrer_info()
    }

    let data: CaptureResult = {
      uuid: uuidv7(),
      event: event_name,
      properties: this._calculate_event_properties(event_name, properties || {}),
    }
    if (event_name === '$identify') {
      data['$set'] = options['$set']
      data['$set_once'] = options['$set_once']
    }

    data = _copyAndTruncateStrings(data, options._noTruncate ? null : this.get_config('properties_string_max_length'))
    data.timestamp = options.timestamp || new Date()
    if (this.get_config('debug')) {
      logger.log('stark send', data)
    }

    if (event_name === '$pageview' || event_name === '$pagehidden' || event_name === '$pageloaded') {
      data = pageViewDataManager(data, event_name)
    }
    if (event_name === '$pageshow') {
      return pageViewDataManager(data, event_name)
    }
    // const jsonData = JSON.stringify(data)

    const url = this.get_config('api_host') + (options.endpoint || '/e/')

    const has_unique_traits = options !== __NOOPTIONS
    if (this.get_config('request_batching') && (!has_unique_traits || options._batchKey) && !options.send_instantly) {
      this._requestQueue.enqueue(url, data, options)
    } else {
      console.log('request_batching', data)
      this.__compress_and_send_json_request(url, data, options)
    }

    this._invokeCaptureHooks(event_name, data)
    return data
  }

  _addCaptureHook(callback: (eventName: string) => void): void {
    this.__captureHooks.push(callback)
  }

  _invokeCaptureHooks(eventName: string, eventData: CaptureResult): void {
    this.config._onCapture(eventName, eventData)
    _each(this.__captureHooks, (callback) => callback(eventName))
  }

  _calculate_event_properties(event_name: string, event_properties: Properties): Properties {
    const start_timestamp = this.persistence.remove_event_timer(event_name)
    let properties = { ...event_properties }
    properties['token'] = this.get_config('token')
    properties['$platform_info'] = this.get_config('platform_info') && this.get_config('platform_info')
    properties['$form_type'] = event_name === '$pageview' ? 1 : event_name === '$autocapture' ? 2 : 3
    if (event_name === '$snapshot') {
      const persistenceProps = { ...this.persistence.properties(), ...this.sessionPersistence.properties() }
      properties['distinct_id'] = persistenceProps.distinct_id
      return properties
    }

    const infoProperties = _info.properties()

    if (this.sessionManager) {
      const { sessionId, windowId } = this.sessionManager.checkAndGetSessionAndWindowId()
      properties['$session_id'] = sessionId
      properties['$window_id'] = windowId
    }

    if (this.webPerformance?.isEnabled) {
      if (event_name === '$pageview') {
        this.pageViewIdManager.onPageview()
      }
      properties = _extend(properties, { $pageview_id: this.pageViewIdManager.getPageViewId() })
    }

    if (event_name === '$pageview') {
      properties['$title'] = document.title
      properties['$page_id'] = document.getElementById(this.config.page_id)?.innerText
      properties['$event_type'] = 'pageload'
    }

    if (event_name === '$performance_event') {
      const persistenceProps = this.persistence.properties()
      properties['distinct_id'] = persistenceProps.distinct_id
      properties['$current_url'] = infoProperties.$current_url
      return properties
    }

    if (typeof start_timestamp !== 'undefined') {
      const duration_in_ms = new Date().getTime() - start_timestamp
      properties['$duration'] = parseFloat((duration_in_ms / 1000).toFixed(3))
    }

    properties = _extend(
      {},
      _info.properties(),
      this.persistence.properties(),
      this.sessionPersistence.properties(),
      properties
    )

    const property_blacklist = this.get_config('property_blacklist')
    if (_isArray(property_blacklist)) {
      _each(property_blacklist, function (blacklisted_prop) {
        delete properties[blacklisted_prop]
      })
    } else {
      console.error('Invalid value for property_blacklist config: ' + property_blacklist)
    }

    const sanitize_properties = this.get_config('sanitize_properties')
    if (sanitize_properties) {
      properties = sanitize_properties(properties, event_name)
    }

    return properties
  }

  /**
   *
   * @param {Object} properties
   * @param {Number} [days]
   */
  register(properties: Properties, days?: number): void {
    this.persistence.register(properties, days)
  }

  /**
   * @param {Object} properties
   * @param {*} [default_value]
   * @param {Number} [days]
   */
  register_once(properties: Properties, default_value?: Property, days?: number): void {
    this.persistence.register_once(properties, default_value, days)
  }

  /**
   * @param {Object} properties
   */
  register_for_session(properties: Properties): void {
    this.sessionPersistence.register(properties)
  }

  /**
   * @param {String} property
   */
  unregister(property: string): void {
    this.persistence.unregister(property)
  }

  /**
   * @param {String} property
   */
  unregister_for_session(property: string): void {
    this.sessionPersistence.unregister(property)
  }

  _register_single(prop: string, value: Property) {
    this.register({ [prop]: value })
  }

  /**/
  getFeatureFlag(key: string, options?: { send_event?: boolean }): boolean | string | undefined {
    return this.featureFlags.getFeatureFlag(key, options)
  }

  getFeatureFlagPayload(key: string): JsonType {
    const payload = this.featureFlags.getFeatureFlagPayload(key)
    try {
      return JSON.parse(payload as any)
    } catch {
      return payload
    }
  }

  isFeatureEnabled(key: string, options?: isFeatureEnabledOptions): boolean | undefined {
    return this.featureFlags.isFeatureEnabled(key, options)
  }

  reloadFeatureFlags(): void {
    this.featureFlags.reloadFeatureFlags()
  }

  updateEarlyAccessFeatureEnrollment(key: string, isEnrolled: boolean): void {
    this.featureFlags.updateEarlyAccessFeatureEnrollment(key, isEnrolled)
  }

  getEarlyAccessFeatures(callback: EarlyAccessFeatureCallback, force_reload = false): void {
    return this.featureFlags.getEarlyAccessFeatures(callback, force_reload)
  }

  onFeatureFlags(callback: (flags: string[], variants: Record<string, string | boolean>) => void): () => void {
    return this.featureFlags.onFeatureFlags(callback)
  }

  onSessionId(callback: SessionIdChangedCallback): () => void {
    return this.sessionManager.onSessionId(callback)
  }

  getSurveys(callback: SurveyCallback, forceReload = false): void {
    this.surveys.getSurveys(callback, forceReload)
  }

  getActiveMatchingSurveys(callback: SurveyCallback, forceReload = false): void {
    this.surveys.getActiveMatchingSurveys(callback, forceReload)
  }

  /**
   * @param {String} [new_distinct_id]
   * @param {Object} [userPropertiesToSet]
   * @param {Object} [userPropertiesToSetOnce]
   */
  identify(new_distinct_id?: string, userPropertiesToSet?: Properties, userPropertiesToSetOnce?: Properties): void {
    if (!new_distinct_id) {
      return
    }

    const previous_distinct_id = this.get_distinct_id()
    this.register({ $user_id: new_distinct_id })

    if (!this.get_property('$device_id')) {
      const device_id = previous_distinct_id
      this.register_once(
        {
          $had_persisted_distinct_id: true,
          $device_id: device_id,
        },
        ''
      )
    }

    if (new_distinct_id !== previous_distinct_id && new_distinct_id !== this.get_property(ALIAS_ID_KEY)) {
      this.unregister(ALIAS_ID_KEY)
      this.register({ distinct_id: new_distinct_id })
    }

    const isKnownAnonymous = this.persistence.get_user_state() === 'anonymous'

    if (new_distinct_id !== previous_distinct_id && isKnownAnonymous) {
      this.persistence.set_user_state('identified')

      this.setPersonPropertiesForFlags(userPropertiesToSet || {}, false)

      this.capture(
        '$identify',
        {
          distinct_id: new_distinct_id,
          $anon_distinct_id: previous_distinct_id,
        },
        { $set: userPropertiesToSet || {}, $set_once: userPropertiesToSetOnce || {} }
      )
      this.featureFlags.setAnonymousDistinctId(previous_distinct_id)
    } else if (userPropertiesToSet || userPropertiesToSetOnce) {
      this.setPersonProperties(userPropertiesToSet, userPropertiesToSetOnce)
    }

    if (new_distinct_id !== previous_distinct_id) {
      this.reloadFeatureFlags()
      this.unregister(FLAG_CALL_REPORTED)
    }
  }

  /**
   * @param {Object} [userPropertiesToSet]
   * @param {Object} [userPropertiesToSetOnce]
   */
  setPersonProperties(userPropertiesToSet?: Properties, userPropertiesToSetOnce?: Properties): void {
    if (!userPropertiesToSet && !userPropertiesToSetOnce) {
      return
    }

    this.setPersonPropertiesForFlags(userPropertiesToSet || {})

    this.capture('$set', { $set: userPropertiesToSet || {}, $set_once: userPropertiesToSetOnce || {} })
  }

  /**
   * @param {String} groupType
   * @param {String} groupKey
   * @param {Object} groupPropertiesToSet
   */
  group(groupType: string, groupKey: string, groupPropertiesToSet?: Properties): void {
    if (!groupType || !groupKey) {
      return
    }

    const existingGroups = this.getGroups()

    if (existingGroups[groupType] !== groupKey) {
      this.resetGroupPropertiesForFlags(groupType)
    }

    this.register({ $groups: { ...existingGroups, [groupType]: groupKey } })

    if (groupPropertiesToSet) {
      this.capture('$groupidentify', {
        $group_type: groupType,
        $group_key: groupKey,
        $group_set: groupPropertiesToSet,
      })
      this.setGroupPropertiesForFlags({ [groupType]: groupPropertiesToSet })
    }

    if (existingGroups[groupType] !== groupKey && !groupPropertiesToSet) {
      this.reloadFeatureFlags()
    }
  }

  resetGroups(): void {
    this.register({ $groups: {} })
    this.resetGroupPropertiesForFlags()
    this.reloadFeatureFlags()
  }

  setPersonPropertiesForFlags(properties: Properties, reloadFeatureFlags = true): void {
    this.featureFlags.setPersonPropertiesForFlags(properties, reloadFeatureFlags)
  }

  resetPersonPropertiesForFlags(): void {
    this.featureFlags.resetPersonPropertiesForFlags()
  }

  setGroupPropertiesForFlags(properties: { [type: string]: Properties }, reloadFeatureFlags = true): void {
    this.featureFlags.setGroupPropertiesForFlags(properties, reloadFeatureFlags)
  }

  resetGroupPropertiesForFlags(group_type?: string): void {
    this.featureFlags.resetGroupPropertiesForFlags(group_type)
  }

  reset(reset_device_id?: boolean): void {
    const device_id = this.get_property('$device_id')
    this.persistence.clear()
    this.sessionPersistence.clear()
    this.persistence.set_user_state('anonymous')
    this.sessionManager.resetSessionId()
    const uuid = this.get_config('get_device_id')(uuidv7())
    this.register_once(
      {
        distinct_id: uuid,
        $device_id: reset_device_id ? uuid : device_id,
      },
      ''
    )
  }

  get_distinct_id(): string {
    return this.get_property('distinct_id')
  }

  getGroups(): Record<string, any> {
    return this.get_property('$groups') || {}
  }

  get_session_id(): string {
    return this.sessionManager.checkAndGetSessionAndWindowId(true).sessionId
  }

  /**
   * @param options
   * @param options.withTimestamp
   * @param options.timestampLookBack
   */
  get_session_replay_url(options?: { withTimestamp?: boolean; timestampLookBack?: number }): string {
    const host = this.config.ui_host || this.config.api_host
    const { sessionId, sessionStartTimestamp } = this.sessionManager.checkAndGetSessionAndWindowId(true)
    let url = host + '/replay/' + sessionId
    if (options?.withTimestamp && sessionStartTimestamp) {
      const LOOK_BACK = options.timestampLookBack ?? 10
      if (!sessionStartTimestamp) {
        return url
      }
      const recordingStartTime = Math.max(
        Math.floor((new Date().getTime() - sessionStartTimestamp) / 1000) - LOOK_BACK,
        0
      )
      url += `?t=${recordingStartTime}`
    }

    return url
  }

  /**
   * @param {String} alias
   * @param {String} [original]
   */
  alias(alias: string, original?: string): CaptureResult | void | number {
    if (alias === this.get_property(PEOPLE_DISTINCT_ID_KEY)) {
      logger.critical('Attempting to create alias for existing People user - aborting.')
      return -2
    }

    if (_isUndefined(original)) {
      original = this.get_distinct_id()
    }
    if (alias !== original) {
      this._register_single(ALIAS_ID_KEY, alias)
      return this.capture('$create_alias', { alias: alias, distinct_id: original })
    } else {
      this.identify(alias)
      return -1
    }
  }

  /**
   * @param {Object} config
   */

  set_config(config: Partial<PostHogConfig>): void {
    const oldConfig = { ...this.config }
    if (_isObject(config)) {
      _extend(this.config, config)

      if (!this.get_config('persistence_name')) {
        this.config.persistence_name = this.config.cookie_name
      }
      if (!this.get_config('disable_persistence')) {
        this.config.disable_persistence = this.config.disable_cookie
      }

      if (this.persistence) {
        this.persistence.update_config(this.config)
      }
      if (this.sessionPersistence) {
        this.sessionPersistence.update_config(this.config)
      }
      if (localStore.is_supported() && localStore.get('ph_debug') === 'true') {
        this.config.debug = true
      }
      if (this.get_config('debug')) {
        Config.DEBUG = true
      }

      if (this.sessionRecording && typeof config.disable_session_recording !== 'undefined') {
        if (oldConfig.disable_session_recording !== config.disable_session_recording) {
          if (config.disable_session_recording) {
            this.sessionRecording.stopRecording()
          } else {
            this.sessionRecording.startRecordingIfEnabled()
          }
        }
      }
    }
  }

  /**
   * 打开会话记录并更新配置选项
   */
  startSessionRecording(): void {
    this.set_config({ disable_session_recording: false })
  }

  /**
   * 关闭会话记录并更新配置选项
   */
  stopSessionRecording(): void {
    this.set_config({ disable_session_recording: true })
  }

  /**
   * 返回一个布尔值，指示是否进行会话记录
   */
  sessionRecordingStarted(): boolean {
    return !!this.sessionRecording?.started()
  }

  /**
   * 返回一个布尔值，指示工具栏是否加载
   * @param toolbarParams
   */

  loadToolbar(params: ToolbarParams): boolean {
    return this.toolbar.loadToolbar(params)
  }

  /**
   * 返回库的当前配置对象。
   */
  get_config<K extends keyof PostHogConfig>(prop_name: K): PostHogConfig[K] {
    return this.config?.[prop_name]
  }

  /**
   * 返回名为 property_name 的超级属性的值。 如果没有这样的
   * @param {String} property_name 您要检索的超级属性的名称
   */
  get_property(property_name: string): Property | undefined {
    return this.persistence['props'][property_name]
  }

  /**
   * @param {String} property_name
   */
  getSessionProperty(property_name: string): Property | undefined {
    return this.sessionPersistence['props'][property_name]
  }

  toString(): string {
    let name = this.get_config('name') ?? PRIMARY_INSTANCE_NAME
    if (name !== PRIMARY_INSTANCE_NAME) {
      name = PRIMARY_INSTANCE_NAME + '.' + name
    }
    return name
  }

  _gdpr_init(): void {
    const is_localStorage_requested = this.get_config('opt_out_capturing_persistence_type') === 'localStorage'

    if (is_localStorage_requested && localStore.is_supported()) {
      if (!this.has_opted_in_capturing() && this.has_opted_in_capturing({ persistence_type: 'cookie' })) {
        this.opt_in_capturing({ enable_persistence: false })
      }
      if (!this.has_opted_out_capturing() && this.has_opted_out_capturing({ persistence_type: 'cookie' })) {
        this.opt_out_capturing({ clear_persistence: false })
      }
      this.clear_opt_in_out_capturing({
        persistence_type: 'cookie',
        enable_persistence: false,
      })
    }

    // 检查用户是否已经选择退出 - 如果是，则清除并禁用持久性
    if (this.has_opted_out_capturing()) {
      this._gdpr_update_persistence({ clear_persistence: true })

      // 检查是否应该默认选择退出
      // 注意：默认情况下，我们不会清除此处的持久性，因为选择退出默认状态通常是
      // 在收集 GDPR 信息时用作初始状态
    } else if (
      !this.has_opted_in_capturing() &&
      (this.get_config('opt_out_capturing_by_default') || cookieStore.get('ph_optout'))
    ) {
      cookieStore.remove('ph_optout')
      this.opt_out_capturing({
        clear_persistence: this.get_config('opt_out_persistence_by_default'),
      })
    }
  }

  /**
   * 根据选项启用或禁用持久性
   * 仅当持久性尚未处于此状态时才启用/禁用
   * @param {boolean} [options.clear_persistence] 如果为 true，将删除 sdk 持久存储的所有数据并禁用它
   * @param {boolean} [options.enable_persistence] 如果为 true，将重新启用 sdk 持久性
   */
  _gdpr_update_persistence(options: Partial<OptInOutCapturingOptions>): void {
    let disabled
    if (options && options['clear_persistence']) {
      disabled = true
    } else if (options && options['enable_persistence']) {
      disabled = false
    } else {
      return
    }

    if (!this.get_config('disable_persistence') && this.persistence.disabled !== disabled) {
      this.persistence.set_disabled(disabled)
    }
    if (!this.get_config('disable_persistence') && this.sessionPersistence.disabled !== disabled) {
      this.sessionPersistence.set_disabled(disabled)
    }
  }

  // 构造适当的令牌和选项参数后调用基本 gdpr 函数
  _gdpr_call_func<R = any>(
    func: (token: string, options: GDPROptions) => R,
    options?: Partial<OptInOutCapturingOptions>
  ): R {
    options = _extend(
      {
        capture: this.capture.bind(this),
        persistence_type: this.get_config('opt_out_capturing_persistence_type'),
        cookie_prefix: this.get_config('opt_out_capturing_cookie_prefix'),
        cookie_expiration: this.get_config('cookie_expiration'),
        cross_subdomain_cookie: this.get_config('cross_subdomain_cookie'),
        secure_cookie: this.get_config('secure_cookie'),
      },
      options || {}
    )

    // 检查 localStorage 是否可用于记录选择退出状态，如果不能，则回退到 cookie
    if (!localStore.is_supported() && options['persistence_type'] === 'localStorage') {
      options['persistence_type'] = 'cookie'
    }

    return func(this.get_config('token'), {
      capture: options['capture'],
      captureEventName: options['capture_event_name'],
      captureProperties: options['capture_properties'],
      persistenceType: options['persistence_type'],
      persistencePrefix: options['cookie_prefix'],
      cookieExpiration: options['cookie_expiration'],
      crossSubdomainCookie: options['cross_subdomain_cookie'],
      secureCookie: options['secure_cookie'],
    })
  }

  opt_in_capturing(options?: Partial<OptInOutCapturingOptions>): void {
    options = _extend(
      {
        enable_persistence: true,
      },
      options || {}
    )

    this._gdpr_call_func(optIn, options)
    this._gdpr_update_persistence(options)
  }

  opt_out_capturing(options?: Partial<OptInOutCapturingOptions>): void {
    const _options = _extend(
      {
        clear_persistence: true,
      },
      options || {}
    )

    this._gdpr_call_func(optOut, _options)
    this._gdpr_update_persistence(_options)
  }

  has_opted_in_capturing(options?: Partial<OptInOutCapturingOptions>): boolean {
    return this._gdpr_call_func(hasOptedIn, options)
  }

  has_opted_out_capturing(options?: Partial<OptInOutCapturingOptions>): boolean {
    return this._gdpr_call_func(hasOptedOut, options)
  }

  clear_opt_in_out_capturing(options?: Partial<OptInOutCapturingOptions>): void {
    const _options: Partial<OptInOutCapturingOptions> = _extend(
      {
        enable_persistence: true,
      },
      options ?? {}
    )
    this._gdpr_call_func(clearOptInOut, _options)
    this._gdpr_update_persistence(_options)
  }

  debug(debug?: boolean): void {
    if (debug === false) {
      localStorage && localStorage.removeItem('ph_debug')
      this.set_config({ debug: false })
    } else {
      localStorage && localStorage.setItem('ph_debug', 'true')
      this.set_config({ debug: true })
    }
  }
}

_safewrap_class(PostHog, ['identify'])

const instances: Record<string, PostHog> = {}
const extend_mp = function () {
  _each(instances, function (instance, name) {
    if (name !== PRIMARY_INSTANCE_NAME) {
      posthog_master[name] = instance
    }
  })
}

const override_ph_init_func = function () {
  posthog_master['init'] = function (token?: string, config?: Partial<PostHogConfig>, name?: string) {
    if (name) {
      if (!posthog_master[name]) {
        posthog_master[name] = instances[name] = create_phlib(token || '', config || {}, name, (instance: PostHog) => {
          posthog_master[name] = instances[name] = instance
          instance._loaded()
        })
      }
      return posthog_master[name]
    } else {
      let instance: PostHog = posthog_master as any as PostHog

      if (instances[PRIMARY_INSTANCE_NAME]) {
        instance = instances[PRIMARY_INSTANCE_NAME]
      } else if (token) {
        instance = create_phlib(token, config || {}, PRIMARY_INSTANCE_NAME, (instance: PostHog) => {
          instances[PRIMARY_INSTANCE_NAME] = instance
          instance._loaded()
        })
        instances[PRIMARY_INSTANCE_NAME] = instance
      }

      ;(posthog_master as any) = instance
      if (init_type === InitType.INIT_SNIPPET) {
        ;(window as any)[PRIMARY_INSTANCE_NAME] = posthog_master
      }
      extend_mp()
      return instance
    }
  }
}

const add_dom_loaded_handler = function () {
  function dom_loaded_handler() {
    if ((dom_loaded_handler as any).done) {
      return
    }
    ;(dom_loaded_handler as any).done = true

    ENQUEUE_REQUESTS = false

    _each(instances, function (inst: PostHog) {
      inst._dom_loaded()
    })
  }

  if (document.addEventListener) {
    if (document.readyState === 'complete') {
      dom_loaded_handler()
    } else {
      document.addEventListener('DOMContentLoaded', dom_loaded_handler, false)
    }
  }

  // 后备处理程序，始终有效
  _register_event(window, 'load', dom_loaded_handler, true)
}

export function init_from_snippet(): void {
  _browser_properties()
  // 后备文件
  init_type = InitType.INIT_SNIPPET
  if (_isUndefined((window as any).starkhog)) {
    ;(window as any).starkhog = []
  }
  posthog_master = (window as any).starkhog

  if (posthog_master['__loaded'] || (posthog_master['config'] && posthog_master['persistence'])) {
    return
  }

  _each(posthog_master['_i'], function (item: [token: string, config: Partial<PostHogConfig>, name: string]) {
    if (item && _isArray(item)) {
      instances[item[2]] = create_phlib(...item)
    }
  })

  override_ph_init_func()
  ;(posthog_master['init'] as any)()

  _each(instances, function (instance) {
    _window_ip(instance._loaded())
  })

  add_dom_loaded_handler()
}

export function init_as_module(): PostHog {
  init_type = InitType.INIT_MODULE
  ;(posthog_master as any) = new PostHog()

  override_ph_init_func()
  ;(posthog_master['init'] as any)()
  add_dom_loaded_handler()

  return posthog_master as any
}
