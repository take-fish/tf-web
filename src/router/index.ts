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
      path: '/agent',
      name: 'agent',
      component: () => import('../views/agent/AgentChatView.vue'),
      meta: { title: 'FishMatrix Agent' },
    },
    {
      path: '/agent/kb',
      name: 'agent-kb',
      component: () => import('../views/agent/KbView.vue'),
      meta: { title: 'Agent 知识库' },
    },
    {
      path: '/agent/admin',
      name: 'agent-admin',
      component: () => import('../views/agent/AdminView.vue'),
      meta: { title: 'Agent 管理台', requiresAdmin: true },
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

  // 管理台只对管理员开放；前端只负责隐藏入口，真正的校验在 tf-agent 侧
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'home' }
  }

  return true
})

export default router
