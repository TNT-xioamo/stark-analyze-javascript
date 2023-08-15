export interface SegmentPluginContext {
  event: {
    event: string
    userId?: string
    anonymousId?: string
    properties: any
  }
}

export interface SegmentPlugin {
  name: string
  version: string
  type: 'enrichment'
  isLoaded: () => boolean
  load: (ctx: SegmentPluginContext, instance: any, config?: any) => Promise<unknown>
  unload?: (ctx: SegmentPluginContext, instance: any) => Promise<unknown> | unknown
  ready?: () => Promise<unknown>
  track?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
  identify?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
  page?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
  group?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
  alias?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
  screen?: (ctx: SegmentPluginContext) => Promise<SegmentPluginContext> | SegmentPluginContext
}
