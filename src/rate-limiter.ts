import { SESSION_RECORDING_BATCH_KEY } from './extensions/sessionrecording'

const supportedRetryHeaders = {
  'X-PostHog-Retry-After-Recordings': SESSION_RECORDING_BATCH_KEY,
  'X-PostHog-Retry-After-Events': 'events',
}

export class RateLimiter {
  limits: Record<string, number> = {}

  isRateLimited(batchKey: string | undefined): boolean {
    const retryAfter = this.limits[batchKey || 'events'] || false

    if (retryAfter === false) {
      return false
    }
    return new Date().getTime() < retryAfter
  }

  on429Response(response: XMLHttpRequest): void {
    if (response.status !== 429) {
      return
    }

    Object.entries(supportedRetryHeaders).forEach(([header, batchKey]) => {
      const responseHeader = response.getResponseHeader(header)
      if (!responseHeader) {
        return
      }

      let retryAfterSeconds = parseInt(responseHeader, 10)
      if (isNaN(retryAfterSeconds)) {
        retryAfterSeconds = 60
      }

      if (retryAfterSeconds) {
        const retryAfterMillis = retryAfterSeconds * 1000
        this.limits[batchKey] = new Date().getTime() + retryAfterMillis
      }
    })
  }
}
