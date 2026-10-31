import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { pushToast } from './lib/toast'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 全局兜底：组件渲染/生命周期异常、未捕获的 Promise 都要给用户一个可读提示，
// 不能只留 console 让用户对着空白页。
app.config.errorHandler = (error, _instance, info) => {
  console.error('[vue]', info, error)
  pushToast(`页面渲染出错（${info}），请刷新重试`, 'error')
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (reason instanceof Error && reason.name === 'AbortError') return
  console.error('[unhandledrejection]', reason)
  pushToast(reason instanceof Error && reason.message ? reason.message : '操作异常，请重试', 'error')
})

app.mount('#app')
