import {
  isDOMError,
  isDOMException,
  isError,
  isErrorEvent,
  isErrorWithStack,
  isEvent,
  isPlainObject,
  isPrimitive,
} from './type-checking'
import { defaultStackParser, StackFrame } from './stack-trace'

/**
 * 基于 wonderful MIT 授权 Sentry SDK
 */
const ERROR_TYPES_PATTERN =
  /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i

export type ErrorEventArgs = [
  event: string | Event,
  source?: string | undefined,
  lineno?: number | undefined,
  colno?: number | undefined,
  error?: Error | undefined
]

export interface ErrorProperties {
  $exception_type: string
  $exception_message: string
  $exception_source?: string
  $exception_lineno?: number
  $exception_colno?: number
  $exception_DOMException_code?: string
  $exception_is_synthetic?: boolean
  $exception_stack_trace_raw?: string
  $exception_handled?: boolean
  $exception_personURL?: string
}

const reactMinifiedRegexp = /Minified React error #\d+;/i

function getPopSize(ex: Error & { framesToPop?: number }): number {
  if (ex) {
    if (typeof ex.framesToPop === 'number') {
      return ex.framesToPop
    }

    if (reactMinifiedRegexp.test(ex.message)) {
      return 1
    }
  }

  return 0
}

export function parseStackFrames(ex: Error & { framesToPop?: number; stacktrace?: string }): StackFrame[] {
  const stacktrace = ex.stacktrace || ex.stack || ''

  const popSize = getPopSize(ex)

  try {
    return defaultStackParser(stacktrace, popSize)
  } catch (e) {
    // no-empty
  }

  return []
}

function errorPropertiesFromError(error: Error): ErrorProperties {
  const frames = parseStackFrames(error)

  return {
    $exception_type: error.name,
    $exception_message: error.message,
    $exception_stack_trace_raw: JSON.stringify(frames),
  }
}

function errorPropertiesFromString(candidate: string): ErrorProperties {
  return {
    $exception_type: 'Error',
    $exception_message: candidate,
  }
}

function extractExceptionKeysForMessage(exception: Record<string, unknown>, maxLength = 40): string {
  const keys = Object.keys(exception)
  keys.sort()

  if (!keys.length) {
    return '[object has no keys]'
  }

  for (let i = keys.length; i > 0; i--) {
    const serialized = keys.slice(0, i).join(', ')
    if (serialized.length > maxLength) {
      continue
    }
    if (i === keys.length) {
      return serialized
    }
    return serialized.length <= maxLength ? serialized : `${serialized.slice(0, maxLength)}...`
  }

  return ''
}

function errorPropertiesFromObject(candidate: Record<string, unknown>): ErrorProperties {
  return {
    $exception_type: isEvent(candidate) ? candidate.constructor.name : 'Error',
    $exception_message: `Non-Error ${'exception'} captured with keys: ${extractExceptionKeysForMessage(candidate)}`,
  }
}

export function errorToProperties([event, source, lineno, colno, error]: ErrorEventArgs): ErrorProperties {
  let errorProperties: Omit<ErrorProperties, '$exception_type' | '$exception_message'> & {
    $exception_type?: string
    $exception_message?: string
  } = {}

  if (error === undefined && typeof event === 'string') {
    let name = 'Error'
    let message = event
    const groups = event.match(ERROR_TYPES_PATTERN)
    if (groups) {
      name = groups[1]
      message = groups[2]
    }
    errorProperties = {
      $exception_type: name,
      $exception_message: message,
    }
  }

  const candidate = error || event

  if (isDOMError(candidate) || isDOMException(candidate)) {
    const domException = candidate as unknown as DOMException

    if (isErrorWithStack(candidate)) {
      errorProperties = errorPropertiesFromError(candidate as Error)
    } else {
      const name = domException.name || (isDOMError(domException) ? 'DOMError' : 'DOMException')
      const message = domException.message ? `${name}: ${domException.message}` : name
      errorProperties = errorPropertiesFromString(message)
      errorProperties.$exception_type = isDOMError(domException) ? 'DOMError' : 'DOMException'
      errorProperties.$exception_message = errorProperties.$exception_message || message
    }
    if ('code' in domException) {
      errorProperties['$exception_DOMException_code'] = `${domException.code}`
    }
  } else if (isErrorEvent(candidate as ErrorEvent) && (candidate as ErrorEvent).error) {
    errorProperties = errorPropertiesFromError((candidate as ErrorEvent).error as Error)
  } else if (isError(candidate)) {
    errorProperties = errorPropertiesFromError(candidate)
  } else if (isPlainObject(candidate) || isEvent(candidate)) {
    const objectException = candidate as Record<string, unknown>
    errorProperties = errorPropertiesFromObject(objectException)
    errorProperties.$exception_is_synthetic = true
  } else {
    // If none of previous checks were valid, then it must be a string
    errorProperties.$exception_type = errorProperties.$exception_type || 'Error'
    errorProperties.$exception_message = errorProperties.$exception_message || candidate
    errorProperties.$exception_is_synthetic = true
  }

  return {
    ...errorProperties,
    $exception_type: errorProperties.$exception_type || 'UnknownErrorType',
    $exception_message: errorProperties.$exception_message || '',
    ...(source
      ? {
          $exception_source: source, // TODO get this from URL if not present
        }
      : {}),
    ...(lineno ? { $exception_lineno: lineno } : {}),
    ...(colno ? { $exception_colno: colno } : {}),
  }
}

export function unhandledRejectionToProperties([ev]: [ev: PromiseRejectionEvent]): ErrorProperties {
  // dig the object of the rejection out of known event types
  let error: unknown = ev
  try {
    if ('reason' in ev) {
      error = ev.reason
    } else if ('detail' in ev && 'reason' in (ev as any).detail) {
      error = (ev as any).detail.reason
    }
  } catch (_oO) {
    // no-empty
  }

  let errorProperties: Omit<ErrorProperties, '$exception_type' | '$exception_message'> & {
    $exception_type?: string
    $exception_message?: string
  } = {}
  if (isPrimitive(error)) {
    errorProperties = {
      $exception_message: `Non-Error promise rejection captured with value: ${String(error)}`,
    }
  } else {
    errorProperties = errorToProperties([error as string | Event])
  }
  errorProperties.$exception_handled = false

  return {
    ...errorProperties,
    $exception_type: (errorProperties.$exception_type = 'UnhandledRejection'),
    $exception_message: (errorProperties.$exception_message =
      errorProperties.$exception_message || (ev as any).reason || String(error)),
  }
}
