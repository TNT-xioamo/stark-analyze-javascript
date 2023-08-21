import type { MaskInputOptions, SlimDOMOptions } from 'rrweb-snapshot'
import { PostHog } from './posthog-core'
import { RetryQueue } from './retry-queue'

export type Property = any
export type Properties = Record<string, Property>
export interface CaptureResult {
  uuid: string
  event: string
  properties: Properties
  $set?: Properties
  $set_once?: Properties
  timestamp?: Date
}
export type CaptureCallback = (response: any, data: any) => void

export type AutocaptureCompatibleElement = 'a' | 'button' | 'form' | 'input' | 'select' | 'textarea' | 'label'
export type DomAutocaptureEvents = 'click' | 'change' | 'submit'

export interface AutocaptureConfig {
  url_allowlist?: (string | RegExp)[]

  dom_event_allowlist?: DomAutocaptureEvents[]

  element_allowlist?: AutocaptureCompatibleElement[]

  css_selector_allowlist?: string[]
}

export type UUIDVersion = 'og' | 'v7'

export interface PostHogConfig {
  api_host: string
  api_method: string
  api_transport: string
  ui_host: string | null
  page_id: string
  token: string
  autocapture: boolean | AutocaptureConfig
  rageclick: boolean
  page_remain: boolean
  cross_subdomain_cookie: boolean
  persistence: 'localStorage' | 'cookie' | 'memory' | 'localStorage+cookie' | 'sessionStorage'
  persistence_name: string
  cookie_name: string
  loaded: (posthog_instance: PostHog) => void
  store_google: boolean
  custom_campaign_params: string[]
  save_referrer: boolean
  test: boolean
  verbose: boolean
  capture_pageview: boolean
  capture_pageleave: boolean
  debug: boolean
  cookie_expiration: number
  upgrade: boolean
  disable_session_recording: boolean
  disable_persistence: boolean
  disable_cookie: boolean
  enable_recording_console_log?: boolean
  secure_cookie: boolean
  ip: boolean
  opt_out_capturing_by_default: boolean
  opt_out_persistence_by_default: boolean
  opt_out_capturing_persistence_type: 'localStorage' | 'cookie'
  opt_out_capturing_cookie_prefix: string | null
  opt_in_site_apps: boolean
  respect_dnt: boolean
  property_blacklist: string[]
  xhr_headers: { [header_name: string]: string }
  on_xhr_error: (failedRequest: XMLHttpRequest) => void
  inapp_protocol: string
  inapp_link_new_window: boolean
  request_batching: boolean
  sanitize_properties: ((properties: Properties, event_name: string) => Properties) | null
  properties_string_max_length: number
  session_recording: SessionRecordingOptions
  session_idle_timeout_seconds: number
  mask_all_element_attributes: boolean
  mask_all_text: boolean
  advanced_disable_decide: boolean
  advanced_disable_feature_flags: boolean
  advanced_disable_feature_flags_on_first_load: boolean
  advanced_disable_toolbar_metrics: boolean
  get_device_id: (uuid: string) => string
  name: string
  callback_fn: string
  _onCapture: (eventName: string, eventData: CaptureResult) => void
  capture_performance?: boolean
  disable_compression: boolean
  bootstrap: {
    distinctID?: string
    isIdentifiedID?: boolean
    featureFlags?: Record<string, boolean | string>
    featureFlagPayloads?: Record<string, JsonType>
  }
  segment?: any
}

export interface OptInOutCapturingOptions {
  capture: (event: string, properties: Properties, options: CaptureOptions) => void
  capture_event_name: string
  capture_properties: Properties
  enable_persistence: boolean
  clear_persistence: boolean
  persistence_type: 'cookie' | 'localStorage' | 'localStorage+cookie'
  cookie_prefix: string
  cookie_expiration: number
  cross_subdomain_cookie: boolean
  secure_cookie: boolean
}

export interface isFeatureEnabledOptions {
  send_event: boolean
}

export interface SessionRecordingOptions {
  blockClass?: string | RegExp
  blockSelector?: string | null
  ignoreClass?: string
  maskTextClass?: string | RegExp
  maskTextSelector?: string | null
  maskTextFn?: ((text: string) => string) | null
  maskAllInputs?: boolean
  maskInputOptions?: MaskInputOptions
  maskInputFn?: ((text: string, element?: HTMLElement) => string) | null
  maskNetworkRequestFn?: ((url: NetworkRequest) => NetworkRequest | null | undefined) | null
  slimDOMOptions?: SlimDOMOptions | 'all' | true
  collectFonts?: boolean
  inlineStylesheet?: boolean
  recorderVersion?: 'v1' | 'v2'
  recordCrossOriginIframes?: boolean
}

export type SessionIdChangedCallback = (sessionId: string, windowId: string | null | undefined) => void

export enum Compression {
  GZipJS = 'gzip-js',
  Base64 = 'base64',
}

export interface XHROptions {
  transport?: 'XHR' | 'sendBeacon'
  method?: 'POST' | 'GET'
  urlQueryArgs?: { compression: Compression }
  verbose?: boolean
  blob?: boolean
  sendBeacon?: boolean
}

export interface CaptureOptions extends XHROptions {
  $set?: Properties
  $set_once?: Properties
  _batchKey?: string
  _metrics?: Properties
  _noTruncate?: boolean
  endpoint?: string
  send_instantly?: boolean
  timestamp?: Date
}

export interface RetryQueueElement {
  retryAt: Date
  requestData: QueuedRequestData
}
export interface QueuedRequestData {
  url: string
  data: Properties
  options: CaptureOptions
  headers?: Properties
  callback?: RequestCallback
  retriesPerformedSoFar?: number
}

export interface XHRParams extends QueuedRequestData {
  retryQueue: RetryQueue
  onXHRError: (req: XMLHttpRequest) => void
  timeout?: number
  onRateLimited?: (req: XMLHttpRequest) => void
}

export interface DecideResponse {
  status: number
  supportedCompression: Compression[]
  config: {
    enable_collect_everything: boolean
  }
  custom_properties: AutoCaptureCustomProperty[]
  featureFlags: Record<string, string | boolean>
  featureFlagPayloads: Record<string, JsonType>
  errorsWhileComputingFlags: boolean
  autocapture_opt_out?: boolean
  capturePerformance?: boolean
  autocaptureExceptions?:
    | boolean
    | {
        endpoint?: string
        errors_to_ignore: string[]
      }
  sessionRecording?: {
    endpoint?: string
    consoleLogRecordingEnabled?: boolean
    recorderVersion?: 'v1' | 'v2'
  }
  toolbarParams: ToolbarParams
  editorParams?: ToolbarParams
  toolbarVersion: 'toolbar'
  isAuthenticated: boolean
  siteApps: { id: number; url: string }[]
}

export type FeatureFlagsCallback = (flags: string[], variants: Record<string, string | boolean>) => void

export interface AutoCaptureCustomProperty {
  name: string
  css_selector: string
  event_selectors: string[]
}

export interface CompressionData {
  data: string
  compression?: Compression
}

export interface GDPROptions {
  capture?: (
    event: string,
    properties: Properties,
    options: CaptureOptions
  ) => void /** 一堆相应的配置小字段 你可以选择使用 */
  captureEventName?: string
  captureProperties?: Properties
  persistenceType?: 'cookie' | 'localStorage' | 'localStorage+cookie'
  persistencePrefix?: string
  cookieExpiration?: number
  crossSubdomainCookie?: boolean
  secureCookie?: boolean
  respectDnt?: boolean
  window?: Window
}

export type RequestCallback = (response: Record<string, any>, data?: Properties) => void

export interface PersistentStore {
  is_supported: () => boolean
  error: (error: any) => void
  parse: (name: string) => any
  get: (name: string) => any
  set: (name: string, value: any, expire_days?: number | null, cross_subdomain?: boolean, secure?: boolean) => void
  remove: (name: string, cross_subdomain?: boolean) => void
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type Breaker = {}
export type EventHandler = (event: Event) => boolean | void

export type ToolbarUserIntent = 'add-action' | 'edit-action'
export type ToolbarSource = 'url' | 'localstorage'
export type ToolbarVersion = 'toolbar'

export interface ToolbarParams {
  token?: string
  temporaryToken?: string
  actionId?: number
  userIntent?: ToolbarUserIntent
  source?: ToolbarSource
  toolbarVersion?: ToolbarVersion
  instrument?: boolean
  distinctId?: string
  userEmail?: string
  dataAttributes?: string[]
  featureFlags?: Record<string, string | boolean>
}

export interface PostData {
  buffer?: BlobPart
  compression?: Compression
  data?: string
}

export interface JSC {
  (): void
  [key: string]: (response: any) => void
}

export type SnippetArrayItem = [method: string, ...args: any[]]

export type JsonType = string | number | boolean | null | { [key: string]: JsonType } | Array<JsonType>

export interface EarlyAccessFeature {
  name: string
  description: string
  stage: 'concept' | 'alpha' | 'beta'
  documentationUrl: string | null
  flagKey: string | null
}

export type EarlyAccessFeatureCallback = (earlyAccessFeatures: EarlyAccessFeature[]) => void

export interface EarlyAccessFeatureResponse {
  earlyAccessFeatures: EarlyAccessFeature[]
}

export type NetworkRequest = {
  url: string
}
