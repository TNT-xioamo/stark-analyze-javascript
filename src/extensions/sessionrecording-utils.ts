import type {
  KeepIframeSrcFn,
  RecordPlugin,
  SamplingStrategy,
  blockClass,
  eventWithTime,
  hooksParam,
  listenerHandler,
  maskTextClass,
  pluginEvent,
  mutationCallbackParam,
} from '@rrweb/types'
import type { Mirror, MaskInputOptions, MaskInputFn, MaskTextFn, SlimDOMOptions, DataURLOptions } from 'rrweb-snapshot'

export const replacementImageURI =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNOCAwSDE2TDAgMTZWOEw4IDBaIiBmaWxsPSIjMkQyRDJEIi8+CjxwYXRoIGQ9Ik0xNiA4VjE2SDhMMTYgOFoiIGZpbGw9IiMyRDJEMkQiLz4KPC9zdmc+Cg=='

export const FULL_SNAPSHOT_EVENT_TYPE = 2
export const META_EVENT_TYPE = 4
export const INCREMENTAL_SNAPSHOT_EVENT_TYPE = 3
export const PLUGIN_EVENT_TYPE = 6
export const MUTATION_SOURCE_TYPE = 0

export const MAX_MESSAGE_SIZE = 5000000 // ~5mb

export type rrwebRecord = {
  (options: recordOptions<eventWithTime>): listenerHandler
  addCustomEvent: (tag: string, payload: any) => void
  takeFullSnapshot: () => void
  mirror: Mirror
}

export declare type recordOptions<T> = {
  emit?: (e: T, isCheckout?: boolean) => void
  checkoutEveryNth?: number
  checkoutEveryNms?: number
  blockClass?: blockClass
  blockSelector?: string
  ignoreClass?: string
  maskTextClass?: maskTextClass
  maskTextSelector?: string
  maskAllInputs?: boolean
  maskInputOptions?: MaskInputOptions
  maskInputFn?: MaskInputFn
  maskTextFn?: MaskTextFn
  slimDOMOptions?: SlimDOMOptions | 'all' | true
  ignoreCSSAttributes?: Set<string>
  inlineStylesheet?: boolean
  hooks?: hooksParam
  // packFn?: PackFn
  sampling?: SamplingStrategy
  dataURLOptions?: DataURLOptions
  recordCanvas?: boolean
  recordCrossOriginIframes?: boolean
  recordAfter?: 'DOMContentLoaded' | 'load'
  userTriggeredOnInput?: boolean
  collectFonts?: boolean
  inlineImages?: boolean
  plugins?: RecordPlugin[]
  mousemoveWait?: number
  keepIframeSrcFn?: KeepIframeSrcFn
  // errorHandler?: ErrorHandler
}

/*
 * 检查数据有效负载是否接近 5mb。 如果是，它会检查数据
 * 数据 URI（可能是造成大负载的罪魁祸首）。 如果它找到数据 URI，它会替换
 * 将其与通用图像（如果它是图像）一起使用或将其删除。
 * @data {object} rr-web 数据对象
 * @returns {object} rr-web数据对象，其中数据uri被过滤掉
 */
export function ensureMaxMessageSize(data: eventWithTime): { event: eventWithTime; size: number } {
  let stringifiedData = JSON.stringify(data)

  if (stringifiedData.length > MAX_MESSAGE_SIZE) {
    const dataURIRegex = /data:([\w\/\-\.]+);(\w+),([^)"]*)/gim
    const matches = stringifiedData.matchAll(dataURIRegex)
    for (const match of matches) {
      if (match[1].toLocaleLowerCase().slice(0, 6) === 'image/') {
        stringifiedData = stringifiedData.replace(match[0], replacementImageURI)
      } else {
        stringifiedData = stringifiedData.replace(match[0], '')
      }
    }
  }
  return { event: JSON.parse(stringifiedData), size: stringifiedData.length }
}

export const CONSOLE_LOG_PLUGIN_NAME = 'rrweb/console@1'

export function truncateLargeConsoleLogs(_event: eventWithTime) {
  const event = _event as pluginEvent<{ payload: string[] }>

  const MAX_STRING_SIZE = 2000
  const MAX_STRINGS_PER_LOG = 10

  if (
    event &&
    typeof event === 'object' &&
    event.type === PLUGIN_EVENT_TYPE &&
    typeof event.data === 'object' &&
    event.data.plugin === CONSOLE_LOG_PLUGIN_NAME
  ) {
    // Note: event.data.payload.payload comes from rr-web, and is an array of strings
    if (event.data.payload.payload.length > MAX_STRINGS_PER_LOG) {
      event.data.payload.payload = event.data.payload.payload.slice(0, MAX_STRINGS_PER_LOG)
      event.data.payload.payload.push('...[truncated]')
    }
    const updatedPayload = []
    for (let i = 0; i < event.data.payload.payload.length; i++) {
      if (
        event.data.payload.payload[i] && // Value can be null
        event.data.payload.payload[i].length > MAX_STRING_SIZE
      ) {
        updatedPayload.push(event.data.payload.payload[i].slice(0, MAX_STRING_SIZE) + '...[truncated]')
      } else {
        updatedPayload.push(event.data.payload.payload[i])
      }
    }
    event.data.payload.payload = updatedPayload
    return _event
  }
  return _event
}

export class MutationRateLimiter {
  private bucketSize = 100
  private refillRate = 10
  private mutationBuckets: Record<string, number> = {}
  private loggedTracker: Record<string, boolean> = {}

  constructor(
    private readonly rrweb: rrwebRecord,
    private readonly options: {
      bucketSize?: number
      refillRate?: number
      onBlockedNode?: (id: number, node: Node | null) => void
    } = {}
  ) {
    this.refillRate = this.options.refillRate ?? this.refillRate
    this.bucketSize = this.options.bucketSize ?? this.bucketSize
    setInterval(() => {
      this.refillBuckets()
    }, 1000)
  }

  private refillBuckets = () => {
    Object.keys(this.mutationBuckets).forEach((key) => {
      this.mutationBuckets[key] = this.mutationBuckets[key] + this.refillRate

      if (this.mutationBuckets[key] >= this.bucketSize) {
        delete this.mutationBuckets[key]
      }
    })
  }

  private getNodeOrRelevantParent = (id: number): [number, Node | null] => {
    const node = this.rrweb.mirror.getNode(id)

    if (node?.nodeName !== 'svg' && node instanceof Element) {
      const closestSVG = node.closest('svg')

      if (closestSVG) {
        return [this.rrweb.mirror.getId(closestSVG), closestSVG]
      }
    }

    return [id, node]
  }

  private numberOfChanges = (data: Partial<mutationCallbackParam>) => {
    return (
      (data.removes?.length ?? 0) +
      (data.attributes?.length ?? 0) +
      (data.texts?.length ?? 0) +
      (data.adds?.length ?? 0)
    )
  }

  public throttleMutations = (event: eventWithTime) => {
    if (event.type !== INCREMENTAL_SNAPSHOT_EVENT_TYPE || event.data.source !== MUTATION_SOURCE_TYPE) {
      return event
    }

    const data = event.data as Partial<mutationCallbackParam>
    const initialMutationCount = this.numberOfChanges(data)

    if (data.attributes) {
      data.attributes = data.attributes.filter((attr) => {
        const [nodeId, node] = this.getNodeOrRelevantParent(attr.id)

        if (this.mutationBuckets[nodeId] === 0) {
          return false
        }

        this.mutationBuckets[nodeId] = this.mutationBuckets[nodeId] ?? this.bucketSize
        this.mutationBuckets[nodeId] = Math.max(this.mutationBuckets[nodeId] - 1, 0)

        if (this.mutationBuckets[nodeId] === 0) {
          if (!this.loggedTracker[nodeId]) {
            this.loggedTracker[nodeId] = true
            this.options.onBlockedNode?.(nodeId, node)
          }
        }

        return attr
      })
    }

    const mutationCount = this.numberOfChanges(data)

    if (mutationCount === 0 && initialMutationCount !== mutationCount) {
      return
    }
    return event
  }
}
