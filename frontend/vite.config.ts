import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// 개발 서버는 /api 요청을 Rust 백엔드(기본 8080)로 프록시한다. 프론트엔드는 LLM API를 직접 호출하지 않는다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.FINOVA_API ?? 'http://localhost:8080', changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
