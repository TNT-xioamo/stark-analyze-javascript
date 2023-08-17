import { _each, _includes, _isNumber, _isString, window } from './utils'
import { cookieStore, localStore, localPlusCookieStore } from './storage'
import { GDPROptions, PersistentStore } from './types'
import { PostHog } from './posthog-core'

/**
 *
 * @callback captureFunction
 * @param {String} event_name
 * @param {Object} [properties]
 * @param {Function} [callback]
 */

const GDPR_DEFAULT_PERSISTENCE_PREFIX = '__ph_opt_in_out_'

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {captureFunction} [options.capture] - f
 * @param {string} [options.captureEventName] - e
 * @param {Object} [options.captureProperties] - s
 * @param {string} [options.persistenceType] - s
 * @param {string} [options.persistencePrefix=__ph_opt_in_out] - c
 * @param {Number} [options.cookieExpiration] - n
 * @param {boolean} [options.crossSubdomainCookie] - w
 * @param {boolean} [options.secureCookie] - w
 */
export function optIn(token: string, options: GDPROptions): void {
  _optInOut(true, token, options)
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistenceType]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @param {Number} [options.cookieExpiration]
 * @param {boolean} [options.crossSubdomainCookie]
 * @param {boolean} [options.secureCookie]
 */
export function optOut(token: string, options: GDPROptions): void {
  _optInOut(false, token, options)
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistenceType]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @returns {boolean}
 */
export function hasOptedIn(token: string, options: GDPROptions): boolean {
  return _getStorageValue(token, options) === '1'
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistenceType]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @param {boolean} [options.respectDnt]
 * @returns {boolean}
 */
export function hasOptedOut(token: string, options: Partial<GDPROptions>): boolean {
  if (_hasDoNotTrackFlagOn(options)) {
    return true
  }
  return _getStorageValue(token, options) === '0'
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistenceType]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @param {Number} [options.cookieExpiration]
 * @param {boolean} [options.crossSubdomainCookie]
 * @param {boolean} [options.secureCookie]
 */
export function clearOptInOut(token: string, options: GDPROptions) {
  options = options || {}
  _getStorage(options).remove(_getStorageKey(token, options), !!options.crossSubdomainCookie)
}

/** Private **/

/**
 *
 * @param {Object} [options]
 * @param {string} [options.persistenceType]
 * @returns {object}
 */
function _getStorage(options: GDPROptions): PersistentStore {
  options = options || {}
  if (options.persistenceType === 'localStorage') {
    return localStore
  }
  if (options.persistenceType === 'localStorage+cookie') {
    return localPlusCookieStore
  }
  return cookieStore
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @returns {string}
 */
function _getStorageKey(token: string, options: GDPROptions) {
  options = options || {}
  return (options.persistencePrefix || GDPR_DEFAULT_PERSISTENCE_PREFIX) + token
}

/**
 *
 * @param {string} token
 * @param {Object} [options]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @returns {string}
 */
function _getStorageValue(token: string, options: GDPROptions) {
  return _getStorage(options).get(_getStorageKey(token, options))
}

/**
 *
 * @param {Object} [options]
 * @param {string} [options.window]
 * @param {boolean} [options.respectDnt]
 * @returns {boolean}
 */
function _hasDoNotTrackFlagOn(options: GDPROptions) {
  if (options && options.respectDnt) {
    const win = (options && options.window) || window
    const nav = win['navigator'] || {}
    let hasDntOn = false
    _each(
      [
        nav['doNotTrack'], // 标
        (nav as any)['msDoNotTrack'],
        (win as any)['doNotTrack'],
      ],
      function (dntValue) {
        if (_includes([true, 1, '1', 'yes'], dntValue)) {
          hasDntOn = true
        }
      }
    )
    return hasDntOn
  }
  return false
}

/**
 *
 * @param {boolean} optValue
 * @param {string} token
 * @param {Object} [options]
 * @param {captureFunction} [options.capture]
 * @param {string} [options.captureEventName]
 * @param {Object} [options.captureProperties]
 * @param {string} [options.persistencePrefix=__ph_opt_in_out]
 * @param {Number} [options.cookieExpiration]
 * @param {boolean} [options.crossSubdomainCookie]
 * @param {boolean} [options.secureCookie]
 */
function _optInOut(optValue: boolean, token: string, options: GDPROptions) {
  if (!_isString(token) || !token.length) {
    console.error('gdpr.' + (optValue ? 'optIn' : 'optOut') + ' called with an invalid token')
    return
  }

  options = options || {}

  _getStorage(options).set(
    _getStorageKey(token, options),
    optValue ? 1 : 0,
    _isNumber(options.cookieExpiration) ? options.cookieExpiration : null,
    options.crossSubdomainCookie,
    options.secureCookie
  )

  if (options.capture && optValue) {
    // only capture event if opting in (optValue=true)
    options.capture(options.captureEventName || '$opt_in', options.captureProperties || {}, {
      send_instantly: true,
    })
  }
}

export function userOptedOut(posthog: PostHog, silenceErrors: boolean | undefined) {
  let optedOut = false

  try {
    const token = posthog.get_config('token')
    const respectDnt = posthog.get_config('respect_dnt')
    const persistenceType = posthog.get_config('opt_out_capturing_persistence_type')
    const persistencePrefix = posthog.get_config('opt_out_capturing_cookie_prefix') || undefined
    const win = posthog.get_config('window' as any) as Window | undefined

    if (token) {
      optedOut = hasOptedOut(token, {
        respectDnt,
        persistenceType,
        persistencePrefix,
        window: win,
      })
    }
  } catch (err) {
    if (!silenceErrors) {
      console.error('Unexpected error when checking capturing opt-out status: ' + err)
    }
  }
  return optedOut
}

/**
 * @param {PostHog} posthog
 * @param {function} method
 * @param silenceErrors
 * @returns {*}
 */
export function addOptOutCheck<M extends (...args: any[]) => any = (...args: any[]) => any>(
  posthog: PostHog,
  method: M,
  silenceErrors?: boolean
): M {
  return function (...args) {
    const optedOut = userOptedOut(posthog, silenceErrors)

    if (!optedOut) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return method.apply(this, args)
    }

    const callback = args[args.length - 1]
    if (typeof callback === 'function') {
      callback(0)
    }

    return
  } as M
}
