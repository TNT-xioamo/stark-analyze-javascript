export const pageLoadUseIp = (callback?: any) => {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', 'https://api.ipify.org?format=json', true)
  xhr.onreadystatechange = () => {
    if (xhr.readyState == 4 && xhr.status == 200) {
      const response = JSON.parse(xhr.responseText)
      const ip = response.ip
      callback && callback(ip)
    }
  }
  xhr.send()
}
