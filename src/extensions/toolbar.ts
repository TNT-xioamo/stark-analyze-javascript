import { _getHashParam, _register_event, loadScript, logger } from '../utils'
import { PostHog } from '../posthog-core'
import { DecideResponse, ToolbarParams } from '../types'
import { POSTHOG_MANAGED_HOSTS } from './cloud'

export class Toolbar {
  instance: PostHog
  constructor(instance: PostHog) {
    this.instance = instance
  }

  afterDecideResponse(response: DecideResponse) {
    const toolbarParams: ToolbarParams =
      response['toolbarParams'] ||
      response['editorParams'] ||
      (response['toolbarVersion'] ? { toolbarVersion: response['toolbarVersion'] } : {})
    if (
      response['isAuthenticated'] &&
      toolbarParams['toolbarVersion'] &&
      toolbarParams['toolbarVersion'].indexOf('toolbar') === 0
    ) {
      this.loadToolbar({
        ...toolbarParams,
      })
    }
  }

  maybeLoadToolbar(
    location = window.location,
    localStorage: Storage | undefined = undefined,
    history = window.history
  ): boolean {
    try {
      if (!localStorage) {
        try {
          window.localStorage.setItem('test', 'test')
          window.localStorage.removeItem('test')
        } catch (error) {
          return false
        }

        localStorage = window.localStorage
      }

      const stateHash = _getHashParam(location.hash, '__posthog') || _getHashParam(location.hash, 'state')
      const state = stateHash ? JSON.parse(decodeURIComponent(stateHash)) : null
      const parseFromUrl = state && state['action'] === 'ph_authorize'
      let toolbarParams: ToolbarParams

      if (parseFromUrl) {
        toolbarParams = state
        toolbarParams.source = 'url'

        if (toolbarParams && Object.keys(toolbarParams).length > 0) {
          if (state['desiredHash']) {
            location.hash = state['desiredHash']
          } else if (history) {
            history.replaceState('', document.title, location.pathname + location.search) // completely remove hash
          } else {
            location.hash = ''
          }
        }
      } else {
        toolbarParams = JSON.parse(localStorage.getItem('_postHogToolbarParams') || '{}')
        toolbarParams.source = 'localstorage'

        delete toolbarParams.userIntent
      }

      if (toolbarParams['token'] && this.instance.get_config('token') === toolbarParams['token']) {
        this.loadToolbar(toolbarParams)
        return true
      } else {
        return false
      }
    } catch (e) {
      return false
    }
  }

  loadToolbar(params?: ToolbarParams): boolean {
    if ((window as any)['_postHogToolbarLoaded']) {
      return false
    }
    ;(window as any)['_postHogToolbarLoaded'] = true

    const host = this.instance.get_config('api_host')
    const timestampToNearestThirtySeconds = Math.floor(Date.now() / 30000) * 30000
    const toolbarUrl = `${host}${host.endsWith('/') ? '' : '/'}static/toolbar.js?_ts=${timestampToNearestThirtySeconds}`
    const disableToolbarMetrics =
      !POSTHOG_MANAGED_HOSTS.includes(this.instance.get_config('api_host')) &&
      this.instance.get_config('advanced_disable_toolbar_metrics')

    const toolbarParams = {
      token: this.instance.get_config('token'),
      ...params,
      apiURL: host,
      ...(disableToolbarMetrics ? { instrument: false } : {}),
    }

    const { source: _discard, ...paramsToPersist } = toolbarParams // eslint-disable-line
    window.localStorage.setItem('_postHogToolbarParams', JSON.stringify(paramsToPersist))

    loadScript(toolbarUrl, (err) => {
      if (err) {
        logger.error('Failed to load toolbar', err)
        return
      }
      ;((window as any)['ph_load_toolbar'] || (window as any)['ph_load_editor'])(toolbarParams, this.instance)
    })
    _register_event(window, 'turbolinks:load', () => {
      ;(window as any)['_postHogToolbarLoaded'] = false
      this.loadToolbar(toolbarParams)
    })
    return true
  }

  _loadEditor(params: ToolbarParams): boolean {
    return this.loadToolbar(params)
  }

  maybeLoadEditor(
    location = window.location,
    localStorage: Storage | undefined = undefined,
    history = window.history
  ): boolean {
    return this.maybeLoadToolbar(location, localStorage, history)
  }
}
