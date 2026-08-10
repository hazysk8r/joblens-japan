import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  /*
   * 브라우저에서 /api로 시작하는 요청을 보내면
   * Vite 개발 서버가 Spring Boot의 8080 포트로 전달한다.
   *
   * 프런트엔드 코드에 localhost:8080을 반복해서 적지 않아도 되고,
   * 로컬 개발 단계에서 CORS 문제도 피할 수 있다.
   */
  server: {
    host: '127.0.0.1',
    port: 5250,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});