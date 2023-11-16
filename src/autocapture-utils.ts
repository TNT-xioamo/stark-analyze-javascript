import { AutocaptureConfig } from 'types'
import { _each, _includes, _isUndefined, _trim } from './utils'

export function getClassName(el: Element): string {
  switch (typeof el.className) {
    case 'string':
      return el.className
    case 'object':
      return ('baseVal' in el.className ? (el.className as any).baseVal : null) || el.getAttribute('class') || ''
    default:
      return ''
  }
}

export function getSafeText(el: Element): string {
  let elText = ''
  if (shouldCaptureElement(el) && !isSensitiveElement(el) && el.childNodes && el.childNodes.length) {
    _each(el.childNodes, function (child) {
      if (isTextNode(child) && child.textContent) {
        elText += _trim(child.textContent)
          .split(/(\s+)/)
          .filter(shouldCaptureValue)
          .join('')
          .replace(/[\r\n]/g, ' ')
          .replace(/[ ]+/g, ' ')
          .substring(0, 255)
      }
    })
  }
  // console.log('getSafeText', el.childNodes)
  if (shouldCaptureElement(el) && isSensitiveElement(el) && isInteractElement(el)) {
    const v = el as HTMLInputElement
    elText += _trim(v.value)
      .split(/(\s+)/)
      .filter(shouldCaptureValue)
      .join('')
      .replace(/[\r\n]/g, ' ')
      .replace(/[ ]+/g, ' ')
      .substring(0, 255)
  }

  return _trim(elText)
}

export function getSafeImg(el: Element): string {
  let el_bg_img = ''
  const c = el as HTMLElement
  const style = getComputedStyle(c)
  el_bg_img = style.backgroundImage
  return el_bg_img
}

export function isElementNode(el: Element | undefined | null): el is HTMLElement {
  return !!el && el.nodeType === 1
}

export function isTag(el: Element | undefined | null, tag: string): el is HTMLElement {
  return !!el && !!el.tagName && el.tagName.toLowerCase() === tag.toLowerCase()
}

export function isTextNode(el: Element | undefined | null): el is HTMLElement {
  return !!el && el.nodeType === 3
}

export function isDocumentFragment(el: Element | ParentNode | undefined | null): el is DocumentFragment {
  return !!el && el.nodeType === 11
}

export const autocaptureCompatibleElements = [
  'a',
  'button',
  'form',
  'input',
  'select',
  'textarea',
  'label',
  'img',
  'image',
  'div',
]

export function shouldCaptureDomEvent(
  el: Element,
  event: Event,
  autocaptureConfig: AutocaptureConfig | undefined = undefined
): boolean {
  if (!el || isTag(el, 'html') || !isElementNode(el)) {
    return false
  }

  if (autocaptureConfig?.url_allowlist) {
    const url = window.location.href
    const allowlist = autocaptureConfig.url_allowlist
    if (allowlist && !allowlist.some((regex) => url.match(regex))) {
      return false
    }
  }

  if (autocaptureConfig?.dom_event_allowlist) {
    const allowlist = autocaptureConfig.dom_event_allowlist
    if (allowlist && !allowlist.some((eventType) => event.type === eventType)) {
      return false
    }
  }

  if (autocaptureConfig?.element_allowlist) {
    const allowlist = autocaptureConfig.element_allowlist
    if (allowlist && !allowlist.some((elementType) => el.tagName.toLowerCase() === elementType)) {
      return false
    }
  }

  if (autocaptureConfig?.css_selector_allowlist) {
    const allowlist = autocaptureConfig.css_selector_allowlist
    if (allowlist && !allowlist.some((selector) => el.matches(selector))) {
      return false
    }
  }

  let parentIsUsefulElement = false
  const targetElementList: Element[] = [el]
  let parentNode: Element | boolean = true
  let curEl: Element = el
  // && el.children.length < 2
  while (curEl.parentNode && !isTag(curEl, 'body') && el.children.length < 2) {
    if (isDocumentFragment(curEl.parentNode)) {
      targetElementList.push((curEl.parentNode as any).host)
      curEl = (curEl.parentNode as any).host
      continue
    }
    parentNode = (curEl.parentNode as Element) || false
    if (!parentNode) break
    if (autocaptureCompatibleElements.indexOf(parentNode.tagName.toLowerCase()) > -1) {
      parentIsUsefulElement = true
    } else {
      const compStyles = window.getComputedStyle(parentNode)
      if (compStyles && compStyles.getPropertyValue('cursor') === 'pointer') {
        parentIsUsefulElement = true
      }
    }

    targetElementList.push(parentNode)
    curEl = parentNode
  }

  const compStyles = window.getComputedStyle(el)
  if (compStyles && compStyles.getPropertyValue('cursor') === 'pointer' && event.type === 'click') {
    return true
  }

  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'html':
      return false
    case 'form':
      return event.type === 'submit'
    case 'input':
      return event.type === 'change' || event.type === 'click'
    case 'select':
    case 'textarea':
      return event.type === 'change' || event.type === 'click'
    default:
      if (parentIsUsefulElement) return event.type === 'click'
      return (
        event.type === 'click' &&
        (autocaptureCompatibleElements.indexOf(tag) > -1 || el.getAttribute('contenteditable') === 'true')
      )
  }
}

export function shouldCaptureElement(el: Element): boolean {
  for (let curEl = el; curEl.parentNode && !isTag(curEl, 'body'); curEl = curEl.parentNode as Element) {
    const classes = getClassName(curEl).split(' ')
    if (_includes(classes, 'ph-sensitive') || _includes(classes, 'ph-no-capture')) {
      return false
    }
  }

  if (_includes(getClassName(el).split(' '), 'ph-include')) {
    return true
  }

  const type = (el as HTMLInputElement).type || ''
  if (typeof type === 'string') {
    switch (type.toLowerCase()) {
      case 'hidden':
        return false
      case 'password':
        return false
    }
  }

  const name = (el as HTMLInputElement).name || el.id || ''
  if (typeof name === 'string') {
    const sensitiveNameRegex =
      /^cc|cardnum|ccnum|creditcard|csc|cvc|cvv|exp|pass|pwd|routing|seccode|securitycode|securitynum|socialsec|socsec|ssn/i
    if (sensitiveNameRegex.test(name.replace(/[^a-zA-Z0-9]/g, ''))) {
      return false
    }
  }

  return true
}

export function isSensitiveElement(el: Element): boolean {
  const allowedInputTypes = ['button', 'checkbox', 'submit', 'reset', 'img']
  if (
    (isTag(el, 'input') && !allowedInputTypes.includes((el as HTMLInputElement).type)) ||
    isTag(el, 'select') ||
    isTag(el, 'textarea') ||
    el.getAttribute('contenteditable') === 'true'
  ) {
    return true
  }
  return false
}

export function isInteractElement(el: Element): boolean {
  if (isTag(el, 'input') || isTag(el, 'textarea')) return true
  return false
}

export function shouldCaptureValue(value: string): boolean {
  if (value === null || _isUndefined(value)) {
    return false
  }

  if (typeof value === 'string') {
    value = _trim(value)

    const ccRegex =
      /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/
    if (ccRegex.test((value || '').replace(/[- ]/g, ''))) {
      return false
    }

    const ssnRegex = /(^\d{3}-?\d{2}-?\d{4}$)/
    if (ssnRegex.test(value)) {
      return false
    }
  }

  return true
}

export function isAngularStyleAttr(attributeName: string): boolean {
  if (typeof attributeName === 'string') {
    return attributeName.substring(0, 10) === '_ngcontent' || attributeName.substring(0, 7) === '_nghost'
  }
  return false
}

export function getDirectAndNestedSpanText(target: Element): string {
  let text = getSafeText(target)
  text = `${text} ${getNestedSpanText(target)}`.trim()
  return shouldCaptureValue(text) ? text : ''
}

export function getNestedSpanText(target: Element): string {
  let text = ''
  if (target && target.childNodes && target.childNodes.length) {
    _each(target.childNodes, function (child) {
      if (child && child.tagName?.toLowerCase() === 'span') {
        try {
          const spanText = getSafeText(child)
          text = `${text} ${spanText}`.trim()

          if (child.childNodes && child.childNodes.length) {
            text = `${text} ${getNestedSpanText(child)}`.trim()
          }
        } catch (e) {
          console.error(e)
        }
      }
    })
  }
  return text
}
