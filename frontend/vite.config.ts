/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // 小さなファイルをdata: URIにすると、CSPのimg-src 'self'(security-headers.conf)で表示できない。
    // 開発サーバーにはCSPがないため、本番でだけ壊れる。常にファイルとして出力する。
    assetsInlineLimit: 0,
  },

  test: {
    environment: 'jsdom',
    // すべてのテストの前に、CSRFトークンのCookieがある状態にする。
    setupFiles: ['./src/test/setup.ts'],
  },
  /*
   * ブラウザーから/apiで始まるリクエストを送ると、
   * Vite開発サーバーがSpring Bootの8080ポートへ転送する。
   *
   * フロントエンドのコードにlocalhost:8080を繰り返し書かなくてよく、
   * ローカル開発の段階でCORSの問題も避けられる。
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