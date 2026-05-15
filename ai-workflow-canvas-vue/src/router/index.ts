import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../views/LoginPage.vue'
import RegisterPage from '../views/RegisterPage.vue'
import CanvasPage from '../views/CanvasPage.vue'
import AdminPage from '../views/AdminPage.vue'
import HomePage from '../views/HomePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage, meta: { requiresAuth: true } },
    { path: '/login', component: LoginPage },
    { path: '/register', component: RegisterPage },
    { path: '/portal/:tenantCode', component: () => import('../views/PortalPage.vue') },
    { path: '/canvas/:id', component: CanvasPage, meta: { requiresAuth: true } },
    { path: '/admin', component: AdminPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to, _from) => {
  const raw = localStorage.getItem('vf_tokens')
  const isLoggedIn = !!raw

  if (to.meta.requiresAuth && !isLoggedIn) {
    return '/login'
  }

  // 验证 token 是否过期
  if (isLoggedIn && to.meta.requiresAuth) {
    try {
      const tokens = JSON.parse(raw!)
      const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('vf_tokens')
        return '/login'
      }
      // Admin 路由守卫
      if (to.meta.requiresAdmin && payload.role !== 'ADMIN') {
        return '/'
      }
    } catch {
      localStorage.removeItem('vf_tokens')
      return '/login'
    }
  }

  if (isLoggedIn && (to.path === '/login' || to.path === '/register')) {
    return '/'
  }
})

export default router
