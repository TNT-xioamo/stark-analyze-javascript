import { _base64Encode, _entries, _extend } from './utils'
import { PostHog } from './posthog-core'
import {
  DecideResponse,
  FeatureFlagsCallback,
  EarlyAccessFeatureCallback,
  EarlyAccessFeatureResponse,
  Properties,
  JsonType,
  RequestCallback,
} from './types'
import { PostHogPersistence } from './posthog-persistence'

import {
  PERSISTENCE_EARLY_ACCESS_FEATURES,
  ENABLED_FEATURE_FLAGS,
  STORED_GROUP_PROPERTIES_KEY,
  STORED_PERSON_PROPERTIES_KEY,
  FLAG_CALL_REPORTED,
} from './constants'

const PERSISTENCE_ACTIVE_FEATURE_FLAGS = '$active_feature_flags'
const PERSISTENCE_OVERRIDE_FEATURE_FLAGS = '$override_feature_flags'
const PERSISTENCE_FEATURE_FLAG_PAYLOADS = '$feature_flag_payloads'

export const filterActiveFeatureFlags = (featureFlags?: Record<string, string | boolean>) => {
  const activeFeatureFlags: Record<string, string | boolean> = {}
  for (const [key, value] of _entries(featureFlags || {})) {
    if (value) {
      activeFeatureFlags[key] = value
    }
  }
  return activeFeatureFlags
}

export const parseFeatureFlagDecideResponse = (
  response: Partial<DecideResponse>,
  persistence: PostHogPersistence,
  currentFlags: Record<string, string | boolean> = {},
  currentFlagPayloads: Record<string, JsonType> = {}
) => {
  const flags = response['featureFlags']
  const flagPayloads = response['featureFlagPayloads']
  if (flags) {
    if (Array.isArray(flags)) {
      const $enabled_feature_flags: Record<string, boolean> = {}
      if (flags) {
        for (let i = 0; i < flags.length; i++) {
          $enabled_feature_flags[flags[i]] = true
        }
      }
      persistence &&
        persistence.register({
          [PERSISTENCE_ACTIVE_FEATURE_FLAGS]: flags,
          [ENABLED_FEATURE_FLAGS]: $enabled_feature_flags,
        })
    } else {
      let newFeatureFlags = flags
      let newFeatureFlagPayloads = flagPayloads
      if (response.errorsWhileComputingFlags) {
        newFeatureFlags = { ...currentFlags, ...newFeatureFlags }
        newFeatureFlagPayloads = { ...currentFlagPayloads, ...newFeatureFlagPayloads }
      }
      persistence &&
        persistence.register({
          [PERSISTENCE_ACTIVE_FEATURE_FLAGS]: Object.keys(filterActiveFeatureFlags(newFeatureFlags)),
          [ENABLED_FEATURE_FLAGS]: newFeatureFlags || {},
          [PERSISTENCE_FEATURE_FLAG_PAYLOADS]: newFeatureFlagPayloads || {},
        })
    }
  }
}

export class PostHogFeatureFlags {
  instance: PostHog
  _override_warning: boolean
  featureFlagEventHandlers: FeatureFlagsCallback[]
  reloadFeatureFlagsQueued: boolean
  reloadFeatureFlagsInAction: boolean
  $anon_distinct_id: string | undefined

  constructor(instance: PostHog) {
    this.instance = instance
    this._override_warning = false
    this.featureFlagEventHandlers = []

    this.reloadFeatureFlagsQueued = false
    this.reloadFeatureFlagsInAction = false
  }

  getFlags(): string[] {
    return Object.keys(this.getFlagVariants())
  }

  getFlagVariants(): Record<string, string | boolean> {
    const enabledFlags = this.instance.get_property(ENABLED_FEATURE_FLAGS)
    const overriddenFlags = this.instance.get_property(PERSISTENCE_OVERRIDE_FEATURE_FLAGS)
    if (!overriddenFlags) {
      return enabledFlags || {}
    }

    const finalFlags = _extend({}, enabledFlags)
    const overriddenKeys = Object.keys(overriddenFlags)
    for (let i = 0; i < overriddenKeys.length; i++) {
      if (overriddenFlags[overriddenKeys[i]] === false) {
        delete finalFlags[overriddenKeys[i]]
      } else {
        finalFlags[overriddenKeys[i]] = overriddenFlags[overriddenKeys[i]]
      }
    }
    if (!this._override_warning) {
      console.warn('flags!', {
        enabledFlags,
        overriddenFlags,
        finalFlags,
      })
      this._override_warning = true
    }
    return finalFlags
  }

  getFlagPayloads(): Record<string, JsonType> {
    const flagPayloads = this.instance.get_property(PERSISTENCE_FEATURE_FLAG_PAYLOADS)
    return flagPayloads || {}
  }

  reloadFeatureFlags(): void {
    if (!this.reloadFeatureFlagsQueued) {
      this.reloadFeatureFlagsQueued = true
      this._startReloadTimer()
    }
  }

  setAnonymousDistinctId(anon_distinct_id: string): void {
    this.$anon_distinct_id = anon_distinct_id
  }

  setReloadingPaused(isPaused: boolean): void {
    this.reloadFeatureFlagsInAction = isPaused
  }

  resetRequestQueue(): void {
    this.reloadFeatureFlagsQueued = false
  }

  _startReloadTimer(): void {
    if (this.reloadFeatureFlagsQueued && !this.reloadFeatureFlagsInAction) {
      setTimeout(() => {
        if (!this.reloadFeatureFlagsInAction && this.reloadFeatureFlagsQueued) {
          this.reloadFeatureFlagsQueued = false
          this._reloadFeatureFlagsRequest()
        }
      }, 5)
    }
  }

  _reloadFeatureFlagsRequest(): void {
    this.setReloadingPaused(true)
    const token = this.instance.get_config('token')
    const personProperties = this.instance.get_property(STORED_PERSON_PROPERTIES_KEY)
    const groupProperties = this.instance.get_property(STORED_GROUP_PROPERTIES_KEY)
    const json_data = JSON.stringify({
      token: token,
      distinct_id: this.instance.get_distinct_id(),
      groups: this.instance.getGroups(),
      $anon_distinct_id: this.$anon_distinct_id,
      person_properties: personProperties,
      group_properties: groupProperties,
      disable_flags: this.instance.get_config('advanced_disable_feature_flags') || undefined,
    })

    const encoded_data = _base64Encode(json_data)
    this.instance._send_request(
      // 请求地址
      this.instance.get_config('api_host') + '/decide/?v=3',
      { data: encoded_data },
      { method: 'POST' },
      this.instance._prepare_callback((response) => {
        this.$anon_distinct_id = undefined
        this.receivedFeatureFlags(response as DecideResponse)

        this.setReloadingPaused(false)
        this._startReloadTimer()
      }) as RequestCallback
    )
  }

  getFeatureFlag(key: string, options: { send_event?: boolean } = {}): boolean | string | undefined {
    if (!this.instance.decideEndpointWasHit && !(this.getFlags() && this.getFlags().length > 0)) {
      console.warn('getFeatureFlag for key "' + key + '" failed. Feature flags didn\'t load in time.')
      return undefined
    }
    const flagValue = this.getFlagVariants()[key]
    const flagReportValue = `${flagValue}`
    const flagCallReported: Record<string, string[]> = this.instance.get_property(FLAG_CALL_REPORTED) || {}

    if (options.send_event || !('send_event' in options)) {
      if (!(key in flagCallReported) || !flagCallReported[key].includes(flagReportValue)) {
        if (Array.isArray(flagCallReported[key])) {
          flagCallReported[key].push(flagReportValue)
        } else {
          flagCallReported[key] = [flagReportValue]
        }
        this.instance.persistence.register({ [FLAG_CALL_REPORTED]: flagCallReported })

        this.instance.capture('$feature_flag_called', { $feature_flag: key, $feature_flag_response: flagValue })
      }
    }
    return flagValue
  }

  getFeatureFlagPayload(key: string): JsonType {
    const payloads = this.getFlagPayloads()
    return payloads[key]
  }

  isFeatureEnabled(key: string, options: { send_event?: boolean } = {}): boolean | undefined {
    if (!this.instance.decideEndpointWasHit && !(this.getFlags() && this.getFlags().length > 0)) {
      console.warn('isFeatureEnabled for key "' + key + '" failed. Feature flags didn\'t load in time.')
      return undefined
    }
    return !!this.getFeatureFlag(key, options)
  }

  addFeatureFlagsHandler(handler: FeatureFlagsCallback): void {
    this.featureFlagEventHandlers.push(handler)
  }

  removeFeatureFlagsHandler(handler: FeatureFlagsCallback): void {
    this.featureFlagEventHandlers = this.featureFlagEventHandlers.filter((h) => h !== handler)
  }

  receivedFeatureFlags(response: Partial<DecideResponse>): void {
    this.instance.decideEndpointWasHit = true
    const currentFlags = this.getFlagVariants()
    const currentFlagPayloads = this.getFlagPayloads()
    parseFeatureFlagDecideResponse(response, this.instance.persistence, currentFlags, currentFlagPayloads)
    this._fireFeatureFlagsCallbacks()
  }

  override(flags: boolean | string[] | Record<string, string | boolean>): void {
    this._override_warning = false

    if (flags === false) {
      this.instance.persistence.unregister(PERSISTENCE_OVERRIDE_FEATURE_FLAGS)
    } else if (Array.isArray(flags)) {
      const flagsObj: Record<string, string | boolean> = {}
      for (let i = 0; i < flags.length; i++) {
        flagsObj[flags[i]] = true
      }
      this.instance.persistence.register({ [PERSISTENCE_OVERRIDE_FEATURE_FLAGS]: flagsObj })
    } else {
      this.instance.persistence.register({ [PERSISTENCE_OVERRIDE_FEATURE_FLAGS]: flags })
    }
  }

  onFeatureFlags(callback: FeatureFlagsCallback): () => void {
    this.addFeatureFlagsHandler(callback)
    if (this.instance.decideEndpointWasHit) {
      const { flags, flagVariants } = this._prepareFeatureFlagsForCallbacks()
      callback(flags, flagVariants)
    }
    return () => this.removeFeatureFlagsHandler(callback)
  }

  updateEarlyAccessFeatureEnrollment(key: string, isEnrolled: boolean): void {
    const enrollmentPersonProp = {
      [`$feature_enrollment/${key}`]: isEnrolled,
    }
    this.instance.capture('$feature_enrollment_update', {
      $feature_flag: key,
      $feature_enrollment: isEnrolled,
      $set: enrollmentPersonProp,
    })
    this.setPersonPropertiesForFlags(enrollmentPersonProp, false)

    const newFlags = { ...this.getFlagVariants(), [key]: isEnrolled }
    this.instance.persistence.register({
      [PERSISTENCE_ACTIVE_FEATURE_FLAGS]: Object.keys(filterActiveFeatureFlags(newFlags)),
      [ENABLED_FEATURE_FLAGS]: newFlags,
    })
    this._fireFeatureFlagsCallbacks()
  }

  getEarlyAccessFeatures(callback: EarlyAccessFeatureCallback, force_reload = false): void {
    const existing_early_access_features = this.instance.get_property(PERSISTENCE_EARLY_ACCESS_FEATURES)

    if (!existing_early_access_features || force_reload) {
      this.instance._send_request(
        `${this.instance.get_config('api_host')}/api/server/?token=${this.instance.get_config('token')}`,
        {},
        { method: 'GET' },
        (response) => {
          const earlyAccessFeatures = (response as EarlyAccessFeatureResponse).earlyAccessFeatures
          this.instance.persistence.register({ [PERSISTENCE_EARLY_ACCESS_FEATURES]: earlyAccessFeatures })
          return callback(earlyAccessFeatures)
        }
      )
    } else {
      return callback(existing_early_access_features)
    }
  }

  _prepareFeatureFlagsForCallbacks(): { flags: string[]; flagVariants: Record<string, string | boolean> } {
    const flags = this.getFlags()
    const flagVariants = this.getFlagVariants()

    const truthyFlags = flags.filter((flag) => flagVariants[flag])
    const truthyFlagVariants = Object.keys(flagVariants)
      .filter((variantKey) => flagVariants[variantKey])
      .reduce((res: Record<string, string | boolean>, key) => {
        res[key] = flagVariants[key]
        return res
      }, {})

    return {
      flags: truthyFlags,
      flagVariants: truthyFlagVariants,
    }
  }

  _fireFeatureFlagsCallbacks(): void {
    const { flags, flagVariants } = this._prepareFeatureFlagsForCallbacks()
    this.featureFlagEventHandlers.forEach((handler) => handler(flags, flagVariants))
  }

  setPersonPropertiesForFlags(properties: Properties, reloadFeatureFlags = true): void {
    const existingProperties = this.instance.get_property(STORED_PERSON_PROPERTIES_KEY) || {}

    this.instance.register({
      [STORED_PERSON_PROPERTIES_KEY]: {
        ...existingProperties,
        ...properties,
      },
    })

    if (reloadFeatureFlags) {
      this.instance.reloadFeatureFlags()
    }
  }

  resetPersonPropertiesForFlags(): void {
    this.instance.unregister(STORED_PERSON_PROPERTIES_KEY)
  }

  setGroupPropertiesForFlags(properties: { [type: string]: Properties }, reloadFeatureFlags = true): void {
    const existingProperties = this.instance.get_property(STORED_GROUP_PROPERTIES_KEY) || {}

    if (Object.keys(existingProperties).length !== 0) {
      Object.keys(existingProperties).forEach((groupType) => {
        existingProperties[groupType] = {
          ...existingProperties[groupType],
          ...properties[groupType],
        }
        delete properties[groupType]
      })
    }

    this.instance.register({
      [STORED_GROUP_PROPERTIES_KEY]: {
        ...existingProperties,
        ...properties,
      },
    })

    if (reloadFeatureFlags) {
      this.instance.reloadFeatureFlags()
    }
  }

  resetGroupPropertiesForFlags(group_type?: string): void {
    if (group_type) {
      const existingProperties = this.instance.get_property(STORED_GROUP_PROPERTIES_KEY) || {}
      this.instance.register({
        [STORED_GROUP_PROPERTIES_KEY]: { ...existingProperties, [group_type]: {} },
      })
    } else {
      this.instance.unregister(STORED_GROUP_PROPERTIES_KEY)
    }
  }
}
