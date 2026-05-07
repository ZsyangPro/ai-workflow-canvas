import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('../components/AppLayout.vue'),
      children: [
        // SUPER_ADMIN 专属
        {
          path: 'tenants',
          name: 'tenants',
          component: () => import('../views/tenants/TenantList.vue'),
          meta: { roles: ['SUPER_ADMIN'] },
        },
        {
          path: 'tenants/:id',
          name: 'tenant-detail',
          component: () => import('../views/tenants/TenantDetail.vue'),
          meta: { roles: ['SUPER_ADMIN'] },
        },
        {
          path: 'system-users',
          name: 'system-users',
          component: () => import('../views/users/SystemUserList.vue'),
          meta: { roles: ['SUPER_ADMIN'] },
        },
        {
          path: 'models',
          name: 'models',
          component: () => import('../views/models/ModelList.vue'),
          meta: { roles: ['SUPER_ADMIN'] },
        },
        // 共用
        {
          path: 'subjects',
          name: 'subjects',
          component: () => import('../views/subjects/SubjectList.vue'),
          meta: { roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/users/UserList.vue'),
          meta: { roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
        },
        {
          path: 'wallet',
          name: 'wallet',
          component: () => import('../views/wallet/WalletFlows.vue'),
          meta: { roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
        },
        {
          path: 'model-pricing',
          name: 'model-pricing',
          component: () => import('../views/models/ModelPricing.vue'),
          meta: { roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
        },
        {
          path: 'files',
          name: 'files',
          component: () => import('../views/files/FileCategories.vue'),
          meta: { roles: ['SUPER_ADMIN', 'TENANT_ADMIN'] },
        },
        {
          path: '',
          redirect: '/tenants',
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const { isLoggedIn, fetchMe, userRole } = useAuth()

  if (to.meta.guest) {
    if (isLoggedIn.value) return next('/')
    return next()
  }

  if (!isLoggedIn.value) return next('/login')

  const user = await fetchMe()
  if (!user) return next('/login')

  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(user.role)) {
    return next(user.role === 'SUPER_ADMIN' ? '/tenants' : '/subjects')
  }

  // 默认首页按角色
  if (to.path === '/') {
    return next(user.role === 'SUPER_ADMIN' ? '/tenants' : '/subjects')
  }

  next()
})

export default router
