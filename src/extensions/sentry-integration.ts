/**
 * @param {Object} [posthog]
 * @param {string} [organization]
 * @param {Number} [projectId]
 * @param {string} [prefix]
 */

import { PostHog } from '../posthog-core'
import { ErrorProperties } from './exceptions/error-conversion'

// import {
//     Event as _SentryEvent,
//     EventProcessor as _SentryEventProcessor,
//     Hub as _SentryHub,
//     Integration as _SentryIntegration,
// } from '@sentry/types'

type _SentryEvent = any
type _SentryEventProcessor = any
type _SentryHub = any

interface _SentryIntegration {
  name: string
  setupOnce(addGlobalEventProcessor: (callback: _SentryEventProcessor) => void, getCurrentHub: () => _SentryHub): void
}

interface SentryExceptionProperties {
  $sentry_event_id: any
  $sentry_exception: any
  $sentry_exception_message: any
  $sentry_exception_type: any
  $sentry_tags: any
  $sentry_url?: string
}

export class SentryIntegration implements _SentryIntegration {
  name: string

  setupOnce: (
    addGlobalEventProcessor: (callback: _SentryEventProcessor) => void,
    getCurrentHub: () => _SentryHub
  ) => void

  constructor(_posthog: PostHog, organization?: string, projectId?: number, prefix?: string) {
    console.log('哨兵', 'Stark')
    this.name = 'stark-js'
    this.setupOnce = function (addGlobalEventProcessor: (callback: _SentryEventProcessor) => void) {
      addGlobalEventProcessor((event: _SentryEvent) => {
        if (event.level !== 'error' || !_posthog.__loaded) return event
        if (!event.tags) event.tags = {}

        const host = _posthog.config.ui_host || _posthog.config.api_host
        event.tags['PostHog Person URL'] = host + '/person/' + _posthog.get_distinct_id()
        if (_posthog.sessionRecordingStarted()) {
          event.tags['PostHog Recording URL'] = _posthog.get_session_replay_url({ withTimestamp: true })
        }

        const exceptions = event.exception?.values || []

        const data: SentryExceptionProperties & ErrorProperties = {
          $exception_message: exceptions[0]?.value,
          $exception_type: exceptions[0]?.type,
          $exception_personURL: host + '/person/' + _posthog.get_distinct_id(),
          $sentry_event_id: event.event_id,
          $sentry_exception: event.exception,
          $sentry_exception_message: exceptions[0]?.value,
          $sentry_exception_type: exceptions[0]?.type,
          $sentry_tags: event.tags,
        }

        if (organization && projectId)
          data['$sentry_url'] =
            (prefix || 'https://baidu.com/') +
            organization +
            '/issues/?project=' +
            projectId +
            '&query=' +
            event.event_id
        _posthog.capture('$exception', data)
        return event
      })
    }
  }
}
