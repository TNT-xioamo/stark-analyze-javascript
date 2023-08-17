import { _each, logger } from './utils'
import { PostData, XHROptions, XHRParams } from './types'

export const encodePostData = (data: PostData | Uint8Array, options: Partial<XHROptions>): string | BlobPart | null => {
  if (options.blob && data.buffer) {
    return new Blob([data.buffer], { type: 'text/plain' })
  }

  if (options.sendBeacon || options.blob) {
    const body = encodePostData(data, { method: 'POST' }) as BlobPart
    return new Blob([body], { type: 'application/x-www-form-urlencoded' })
  }

  if (options.method !== 'POST') {
    return null
  }
  let body_data
  const isUint8Array = (d: unknown): d is Uint8Array => Object.prototype.toString.call(d) === '[object Uint8Array]'
  if (Array.isArray(data) || isUint8Array(data)) {
    //   // TODO: eh? passing an Array here?
    body_data = 'data=' + encodeURIComponent(data as any)
  } else {
    body_data = 'data=' + encodeURIComponent(data.data as string)
  }
  if ('compression' in data && data.compression) {
    body_data += '&compression=' + data.compression
  }
  return body_data
}

export const xhr = ({
  url,
  data,
  headers,
  options,
  callback,
  retriesPerformedSoFar,
  retryQueue,
  onXHRError,
  timeout = 10000,
  onRateLimited,
}: XHRParams) => {
  const req = new XMLHttpRequest()
  req.open(options.method || 'GET', url, true)

  const body = encodePostData(data, options)
  console.error('encodePostData', body)
  _each(headers, function (headerValue, headerName) {
    req.setRequestHeader(headerName, headerValue)
  })

  if (options.method === 'POST' && !options.blob) {
    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
  }

  req.timeout = timeout
  // send the ph_optout cookie
  // withCredentials cannot be modified until after calling .open on Android and Mobile Safari
  req.withCredentials = true
  req.onreadystatechange = () => {
    if (req.readyState === 4) {
      // XMLHttpRequest.DONE == 4, except in safari 4
      if (req.status === 200) {
        if (callback) {
          let response
          try {
            response = JSON.parse(req.responseText)
          } catch (e) {
            logger.error(e)
            return
          }
          callback(response)
        }
      } else {
        if (typeof onXHRError === 'function') {
          onXHRError(req)
        }

        // don't retry certain errors
        if ([401, 403, 404, 500].indexOf(req.status) < 0) {
          retryQueue.enqueue({
            url,
            data,
            options,
            headers,
            retriesPerformedSoFar: (retriesPerformedSoFar || 0) + 1,
            callback,
          })
        }

        if (req.status === 429) {
          onRateLimited?.(req)
        }

        if (callback) {
          callback({ status: 0 })
        }
      }
    }
  }
  req.send(body)
}
