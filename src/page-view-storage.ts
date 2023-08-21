import { sessionStore } from './storage'
export const pageViewDataManager = (data: any, event_type: string) => {
  if (event_type === '$pageview' || event_type === '$pageshow') {
    sessionStore.set('pageViewDataManager', data)
    return data
  }
  const cur = sessionStore.get('pageViewDataManager')

  if (cur) {
    const cu_obj = JSON.parse(cur)
    if (cu_obj.properties?.$current_url !== data.properties?.$current_url) {
      return data
    }
    const $stay_time = Number(data.properties.$time) - Number(cu_obj.properties.$time)
    data['properties']['$stay_time'] = $stay_time
    data['properties']['$event_type'] = 'pageleave'
    sessionStore.remove('pageViewDataManager')
    return data
  }
}
