// Vite 설정
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5291,
    strictPort: true,
    watch: { usePolling: true },
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
