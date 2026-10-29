import { beforeEach } from 'vitest';

/*
 * ブラウザでは、起動時の /api/auth/me でサーバーがCSRFトークンのCookieを発行する。
 * テストでもその状態から始め、状態を変更するリクエストを送れるようにする。
 * トークンがない状況を検証するテストでは、各テストの中でCookieを削除する。
 */
beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=test-csrf-token; path=/';
  // 前のテストでログインしたユーザーを「このタブの前回のユーザー」として残さない。
  sessionStorage.clear();
});
