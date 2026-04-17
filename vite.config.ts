import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /** Dedicated dev URL: http://localhost:5190/ (falls back if port is taken) */
    host: '127.0.0.1',
    port: 5190,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
})
