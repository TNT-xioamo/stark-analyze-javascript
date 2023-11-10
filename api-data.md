### api-data

```js
{
    "uuid": "018a72dd-9003-7a6a-bde4-9eb71f0f5b25", 
    "event": "$autocapture",
    "properties": {
        "$os": "Mac OS X",
        "$ip": '192.168.0.1'
        "$visitor_id": '57n7cco8f5zml7zv'
        "$os_version": "10.15.7",
        "$browser": "Chrome",
        "$device_type": "Desktop",
        "$current_url": "http://127.0.0.1:5500/demo/demo-index.html",
        "$host": "127.0.0.1:5500",
        "$pathname": "/demo/demo-index.html",
        "$browser_version": 116,
        "$browser_language": "zh-CN",
        "$screen_height": 900,
        "$screen_width": 1440,
        "$viewport_height": 294,
        "$viewport_width": 1440,
        "$lib": "web",
        "$lib_version": "0.0.1",
        "$insert_id": "57n7cco8f5zml7zv",
        "$time": 1694144237572,
        "$stay_time": 1000,
        "distinct_id": "018a21df-5397-7cab-8c5d-138285e2c0b8",
        "$device_id": "018a21df-5397-7cab-8c5d-138285e2c0b8",
        "$autocapture_disabled_server_side": false,
        "$referrer": "$direct",
        "$referring_domain": "$direct",
        "$event_type": "click",
        "$ce_version": 1,
        "$elements": [
            {
                "tag_name": "img",
                "el_text": "",
                "attr__width": "300",
                "attr__src": "https://static001.geekbang.org/resource/image/73/78/7333f477e1919435a9bb7bbe48eda078.jpg?x-oss-process=image/resize,m_fill,h_800,w_1636",
                "attr__alt": "",
                "attr__srcset": "",
                "nth_child": 7,
                "nth_of_type": 1
            },
            {
                "tag_name": "div",
                "el_text": "",
                "attr__id": "root",
                "nth_child": 1,
                "nth_of_type": 1
            }
        ],
        "token": "adck",
        "$form_type": 2,
        "$session_id": "018a72dd-7453-7725-b1b1-880aa5cca8ba",
        "$window_id": "018a72dd-7453-7725-b1b1-880b2698c671",
        "$pageview_id": "018a72dd-7453-7725-b1b1-880c5accb309"
    },
    "offset": 2027
}
```

### 2. 解析

- 🍒 uuid - 本次请求id
- 🍒 event - 本次提交事件类型
- 🍒 properties - 本次提交数据属性
  - 🍒 $os - 系统类型
  - 🍒 $ip - 用户ip
  - 🍒 $visitor_id - 访客标识
  - 🍒 $os_version - 系统版本
  - 🍒 $browser - 浏览器类型
  - 🍒 $device_type - 设备 类型
  - 🍒 $current_url - 当前url
  - 🍒 $browser_version - 浏览器版本
  - 🍒 $browser_language 浏览器语言
  - 🍒 $screen_height 屏幕高度
  - 🍒 $screen_width 屏幕宽度
  - 🍒 $viewport_height 视口高度
  - 🍒 $viewport_width 视口宽度
  - 🍒 $insert_id 插入id # 剥离空数据产生的id
  - 🍒 $time 当前时间
  - 🍒 $stay_time 停留时间
  - 🍒 distinct_id 清洗数据产生的id
  - 🍒 $device_id 洗数据产生的设备ID
  - 🍒 $autocapture_disabled_server_side - 是否禁用服务器端自动采集
  - 🍒 $referrer - 本次请求来源 # $direct
  - 🍒 $referring_domain - 本次请求域 # $direct
  - 🍒 $event_type - 事件类型 # click change submit pageview 
  - 🍒 $ce_version - 版本号
  - 🍒 $elements - 元素列表
    - 🍒 el_text - 文本内容
    - 🍒 attr__width - 元素宽度
    - 🍒 attr__src - 元素src路径
    - 🍒 attr__id - 元素ID
- 🍒 token - 本次请求项目标识 # 自定义
- 🍒 $form_type - 表单类型
- 🍒 $session_id - 本次请求会话id
- 🍒 $window_id - 本次请求窗口id
- 🍒 $pageview_id - 本次请求页面id
- 🍒 offset - 本次请求性能抵消时间数值