const WEBPACK_ERROR_REGEXP = /\(error: (.*)\)/
const STACKTRACE_FRAME_LIMIT = 50

const UNKNOWN_FUNCTION = '?'

const OPERA10_PRIORITY = 10
const OPERA11_PRIORITY = 20
const CHROME_PRIORITY = 30
const WINJS_PRIORITY = 40
const GECKO_PRIORITY = 50

export interface StackFrame {
  filename?: string
  function?: string
  module?: string
  platform?: string
  lineno?: number
  colno?: number
  abs_path?: string
  context_line?: string
  pre_context?: string[]
  post_context?: string[]
  in_app?: boolean
  instruction_addr?: string
  addr_mode?: string
  vars?: { [key: string]: any }
  debug_id?: string
}

function createFrame(filename: string, func: string, lineno?: number, colno?: number): StackFrame {
  const frame: StackFrame = {
    filename,
    function: func,
    in_app: true,
  }

  if (lineno !== undefined) {
    frame.lineno = lineno
  }

  if (colno !== undefined) {
    frame.colno = colno
  }

  return frame
}

export type StackParser = (stack: string, skipFirst?: number) => StackFrame[]
export type StackLineParserFn = (line: string) => StackFrame | undefined
export type StackLineParser = [number, StackLineParserFn]

const chromeRegex =
  /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i
const chromeEvalRegex = /\((\S*)(?::(\d+))(?::(\d+))\)/

const chrome: StackLineParserFn = (line) => {
  const parts = chromeRegex.exec(line)

  if (parts) {
    const isEval = parts[2] && parts[2].indexOf('eval') === 0

    if (isEval) {
      const subMatch = chromeEvalRegex.exec(parts[2])

      if (subMatch) {
        parts[2] = subMatch[1]
        parts[3] = subMatch[2]
        parts[4] = subMatch[3]
      }
    }

    const [func, filename] = extractSafariExtensionDetails(parts[1] || UNKNOWN_FUNCTION, parts[2])

    return createFrame(filename, func, parts[3] ? +parts[3] : undefined, parts[4] ? +parts[4] : undefined)
  }

  return
}

export const chromeStackLineParser: StackLineParser = [CHROME_PRIORITY, chrome]

const geckoREgex =
  /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i
const geckoEvalRegex = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i

const gecko: StackLineParserFn = (line) => {
  const parts = geckoREgex.exec(line)

  if (parts) {
    const isEval = parts[3] && parts[3].indexOf(' > eval') > -1
    if (isEval) {
      const subMatch = geckoEvalRegex.exec(parts[3])

      if (subMatch) {
        parts[1] = parts[1] || 'eval'
        parts[3] = subMatch[1]
        parts[4] = subMatch[2]
        parts[5] = ''
      }
    }

    let filename = parts[3]
    let func = parts[1] || UNKNOWN_FUNCTION
    ;[func, filename] = extractSafariExtensionDetails(func, filename)

    return createFrame(filename, func, parts[4] ? +parts[4] : undefined, parts[5] ? +parts[5] : undefined)
  }

  return
}

export const geckoStackLineParser: StackLineParser = [GECKO_PRIORITY, gecko]

const winjsRegex = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:[-a-z]+):.*?):(\d+)(?::(\d+))?\)?\s*$/i

const winjs: StackLineParserFn = (line) => {
  const parts = winjsRegex.exec(line)

  return parts
    ? createFrame(parts[2], parts[1] || UNKNOWN_FUNCTION, +parts[3], parts[4] ? +parts[4] : undefined)
    : undefined
}

export const winjsStackLineParser: StackLineParser = [WINJS_PRIORITY, winjs]

const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i

const opera10: StackLineParserFn = (line) => {
  const parts = opera10Regex.exec(line)
  return parts ? createFrame(parts[2], parts[3] || UNKNOWN_FUNCTION, +parts[1]) : undefined
}

export const opera10StackLineParser: StackLineParser = [OPERA10_PRIORITY, opera10]

const opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^)]+))\(.*\))? in (.*):\s*$/i

const opera11: StackLineParserFn = (line) => {
  const parts = opera11Regex.exec(line)
  return parts ? createFrame(parts[5], parts[3] || parts[4] || UNKNOWN_FUNCTION, +parts[1], +parts[2]) : undefined
}

export const opera11StackLineParser: StackLineParser = [OPERA11_PRIORITY, opera11]

export const defaultStackLineParsers = [chromeStackLineParser, geckoStackLineParser, winjsStackLineParser]

export function reverse(stack: ReadonlyArray<StackFrame>): StackFrame[] {
  if (!stack.length) {
    return []
  }

  const localStack = stack.slice(0, STACKTRACE_FRAME_LIMIT)

  localStack.reverse()

  return localStack.map((frame) => ({
    ...frame,
    filename: frame.filename || localStack[localStack.length - 1].filename,
    function: frame.function || '?',
  }))
}

export function createStackParser(...parsers: StackLineParser[]): StackParser {
  const sortedParsers = parsers.sort((a, b) => a[0] - b[0]).map((p) => p[1])

  return (stack: string, skipFirst = 0): StackFrame[] => {
    const frames: StackFrame[] = []
    const lines = stack.split('\n')

    for (let i = skipFirst; i < lines.length; i++) {
      const line = lines[i]
      if (line.length > 1024) {
        continue
      }

      const cleanedLine = WEBPACK_ERROR_REGEXP.test(line) ? line.replace(WEBPACK_ERROR_REGEXP, '$1') : line

      if (cleanedLine.match(/\S*Error: /)) {
        continue
      }

      for (const parser of sortedParsers) {
        const frame = parser(cleanedLine)

        if (frame) {
          frames.push(frame)
          break
        }
      }

      if (frames.length >= STACKTRACE_FRAME_LIMIT) {
        break
      }
    }

    return reverse(frames)
  }
}

export const defaultStackParser = createStackParser(...defaultStackLineParsers)

const extractSafariExtensionDetails = (func: string, filename: string): [string, string] => {
  const isSafariExtension = func.indexOf('safari-extension') !== -1
  const isSafariWebExtension = func.indexOf('safari-web-extension') !== -1

  return isSafariExtension || isSafariWebExtension
    ? [
        func.indexOf('@') !== -1 ? func.split('@')[0] : UNKNOWN_FUNCTION,
        isSafariExtension ? `safari-extension:${filename}` : `safari-web-extension:${filename}`,
      ]
    : [func, filename]
}
