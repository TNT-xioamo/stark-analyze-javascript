export class RequestQueueScaffold {
  isPolling: boolean
  _event_queue: any[]
  _empty_queue_count: number
  _poller: number | undefined
  _pollInterval: number

  constructor(pollInterval = 3000) {
    this.isPolling = true
    this._event_queue = []
    this._empty_queue_count = 0
    this._poller = undefined
    this._pollInterval = pollInterval
  }

  setPollInterval(interval: number): void {
    this._pollInterval = interval
    if (this.isPolling) {
      this.poll()
    }
  }

  // eslint-disable-next-line no-unused-vars
  // enqueue(_requestData: Record<string, any>): void {
  //     return
  // }

  poll(): void {
    return
  }

  unload(): void {
    return
  }

  getTime(): number {
    return new Date().getTime()
  }
}
