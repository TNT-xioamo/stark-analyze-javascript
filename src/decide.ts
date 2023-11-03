import { autocapture } from './autocapture'
import { _base64Encode, loadScript } from './utils'
import { PostHog } from './posthog-core'
import { Compression, DecideResponse } from './types'
import { STORED_GROUP_PROPERTIES_KEY, STORED_PERSON_PROPERTIES_KEY } from './constants'

export class Decide {
  instance: PostHog

  constructor(instance: PostHog) {
    this.instance = instance
    this.instance.decideEndpointWasHit = this.instance._hasBootstrappedFeatureFlags()
  }

  call(): void {
    const json_data = JSON.stringify({
      token: this.instance.get_config('token'),
      distinct_id: this.instance.get_distinct_id(),
      groups: this.instance.getGroups(),
      person_properties: this.instance.get_property(STORED_PERSON_PROPERTIES_KEY),
      group_properties: this.instance.get_property(STORED_GROUP_PROPERTIES_KEY),
      disable_flags:
        this.instance.get_config('advanced_disable_feature_flags') ||
        this.instance.get_config('advanced_disable_feature_flags_on_first_load') ||
        undefined,
    })

    // const encoded_data = _base64Encode(json_data)
    const encoded_data = JSON.parse(json_data)
    const response = { autocapture_opt_out: true } as DecideResponse
    autocapture.afterDecideResponse(response, this.instance)
    // this.instance._send_request(
    //   // 请求地址
    //   `${this.instance.get_config('api_host')}/decide/?v=3`,
    //   { data: encoded_data, verbose: true },
    //   { method: 'POST' },
    //   (response) => this.parseDecideResponse(response as DecideResponse)
    // )
  }

  parseDecideResponse(response: DecideResponse): void {
    if (response?.status === 0) {
      return
    }
    if (!(document && document.body)) {
      setTimeout(() => {
        this.parseDecideResponse(response)
      }, 500)
      return
    }
    this.instance.toolbar.afterDecideResponse(response)
    this.instance.sessionRecording?.afterDecideResponse(response)
    autocapture.afterDecideResponse(response, this.instance)
    this.instance.webPerformance?.afterDecideResponse(response)
    this.instance.exceptionAutocapture?.afterDecideResponse(response)

    if (!this.instance.get_config('advanced_disable_feature_flags_on_first_load')) {
      this.instance.featureFlags.receivedFeatureFlags(response)
    }
    console.error('parseDecideResponse', response)
    this.instance['compression'] = {}
    if (response['supportedCompression'] && !this.instance.get_config('disable_compression')) {
      const compression: Partial<Record<Compression, boolean>> = {}
      for (const method of response['supportedCompression']) {
        compression[method] = true
      }
      this.instance['compression'] = compression
    }

    if (response['siteApps']) {
      if (this.instance.get_config('opt_in_site_apps')) {
        const apiHost = this.instance.get_config('api_host')
        for (const { id, url } of response['siteApps']) {
          const scriptUrl = [
            apiHost,
            apiHost[apiHost.length - 1] === '/' && url[0] === '/' ? url.substring(1) : url,
          ].join('')

          ;(window as any)[`__$$ph_site_app_${id}`] = this.instance

          loadScript(scriptUrl, (err) => {
            if (err) {
              console.error(err)
            }
          })
        }
      } else if (response['siteApps'].length > 0) {
        console.error('出错啦')
      }
    }
  }
}
