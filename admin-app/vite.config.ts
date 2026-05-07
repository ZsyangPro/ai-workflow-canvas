import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
