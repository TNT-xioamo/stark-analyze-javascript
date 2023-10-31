import { sessionStore } from './storage'
export const pageViewDataManager = (data: any, event_type: string) => {
  if (event_type === '$pageview' || event_type === '$pageshow') {
    sessionStore.set('pageViewDataManager', data)
    return data
  }
  const cur = sessionStore.get('pageViewDataManager')

  if (cur) {
    if (cur.properties?.$current_url !== data.properties?.$current_url) {
      return data
    }
    const $stay_time = Number(data.properties.$time) - Number(cur.properties.$time)
    data['properties']['$stay_time'] = $stay_time
    data['properties']['$event_type'] = 'pageleave'
    sessionStore.remove('pageViewDataManager')
    return data
  }
  return data
}
export const _page_hash_leave = (even: Event) => {
  const { currentTarget } = even as any
  const back: string = currentTarget.history.state.back
  const current: string = currentTarget.history.state.current
  const data = {
    $current: current,
    $time: Date.now(),
  }
  const cur = sessionStore.get('pageViewEnter')
  if (!cur || cur.$current === back) {
    return {
      $leave_url: back,
      $stay_time: Date.now() - Number(cur.$time),
    }
  }
  sessionStore.set('pageViewEnter', data)
  return null
}
