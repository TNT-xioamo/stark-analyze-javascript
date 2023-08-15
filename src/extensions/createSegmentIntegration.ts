/* eslint-disable compat/compat */
import { PostHog } from '../posthog-core'
import { SegmentPlugin, SegmentPluginContext } from './segment-integration'

export const createSegmentIntegration = (posthog: PostHog): SegmentPlugin => {
  if (!Promise || !Promise.resolve) {
    console.warn('This browser does not have Promise support, and can not use the segment integration')
  }

  const enrichEvent = (ctx: SegmentPluginContext, eventName: string) => {
    if (!ctx.event.userId && ctx.event.anonymousId !== posthog.get_distinct_id()) {
      posthog.reset()
    }
    if (ctx.event.userId && ctx.event.userId !== posthog.get_distinct_id()) {
      posthog.register({
        distinct_id: ctx.event.userId,
      })
      posthog.reloadFeatureFlags()
    }

    const additionalProperties = posthog._calculate_event_properties(eventName, ctx.event.properties)
    ctx.event.properties = Object.assign({}, additionalProperties, ctx.event.properties)
    return ctx
  }

  return {
    name: 'PostHog JS',
    type: 'enrichment',
    version: '1.0.0',
    isLoaded: () => true,
    load: () => Promise.resolve(),
    track: (ctx) => enrichEvent(ctx, ctx.event.event),
    page: (ctx) => enrichEvent(ctx, '$pageview'),
    identify: (ctx) => enrichEvent(ctx, '$identify'),
    screen: (ctx) => enrichEvent(ctx, '$screen'),
  }
}
