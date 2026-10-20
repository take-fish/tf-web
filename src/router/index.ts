import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import HomeView from '../views/HomeView.vue'

function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.startsWith('/login')) return null
  return value
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: '认识一下', public: true, blank: true },
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: 'Overview' },
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/ChatView.vue'),
      meta: { title: 'Terminal' },
    },
    {
      path: '/reader',
      name: 'reader',
      component: () => import('../views/ReaderView.vue'),
      meta: { title: 'Code Review' },
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('../views/GameView.vue'),
      meta: { title: 'Dashboards' },
    },
    {
      path: '/music',
      name: 'music',
      component: () => import('../views/MusicView.vue'),
      meta: { title: 'Pipeline' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    if (to.name === 'login' && auth.hasToken) {
      try {
        if (await auth.ensureSession()) {
          return safeRedirect(to.query.redirect) ?? { name: 'home' }
        }
      } catch {
        // 服务暂时不可达：留在登录页，由用户主动重试
      }
    }
    return true
  }

  if (!auth.hasToken) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  try {
    const valid = await auth.ensureSession()
    if (!valid) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  } catch {
    // 网络异常时沿用本地缓存的登录态，避免服务闪断把入口锁死
    if (!auth.hasToken) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  return true
})

export default router
