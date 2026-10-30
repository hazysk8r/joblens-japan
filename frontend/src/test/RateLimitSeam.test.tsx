import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * ログイン・会員登録がNginxの回数制限(429)で拒否された場合の、画面までのつながりを検証する。
 *
 * 429はバックエンドではなくNginxが返す。本文の形式(JSON・code・message)は
 * scripts/ci/check_docker_smoke.pyが実際のNginxで確認するため、ここでは同じ値を使う。
 * mockするのはfetchだけ。
 */

// check_docker_smoke.pyとfrontend/nginx.confの値と同じにする。
const RATE_LIMITED_CODE = 'TOO_MANY_REQUESTS';
const RATE_LIMITED_MESSAGE = 'リクエストが多すぎます。しばらくしてから再度お試しください。';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function rateLimitedResponse(path: string): Response {
  return jsonResponse(429, {
    status: 429,
    code: RATE_LIMITED_CODE,
    message: RATE_LIMITED_MESSAGE,
    path,
    fieldErrors: {},
  }, { 'Retry-After': '60' });
}

// 未ログインの状態から始まり、認証APIだけが指定の応答を返すサーバーを再現する。
function stubServer(authUrl: string, authResponse: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return jsonResponse(401, { code: 'UNAUTHORIZED' });
    if (url === authUrl) return authResponse();
    return jsonResponse(404, {});
  }));
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function callsTo(url: string): number {
  return vi.mocked(fetch).mock.calls.filter(([requestUrl]) => requestUrl === url).length;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

async function submitLogin() {
  const user = userEvent.setup();
  renderApp('/login');
  await user.type(await screen.findByLabelText('メールアドレス'), 'user@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'password123');
  await user.click(screen.getByRole('button', { name: 'ログイン' }));
}

async function submitSignup() {
  const user = userEvent.setup();
  renderApp('/signup');
  await user.type(await screen.findByLabelText('メールアドレス'), 'new@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'password123');
  await user.type(screen.getByLabelText('パスワード（確認）'), 'password123');
  await user.click(screen.getByRole('button', { name: '登録する' }));
}

describe('ログインが回数制限で拒否された場合', () => {
  test('429를 받으면 Nginx의 메시지를 표시하고, 로그인 화면에 머물며, /me로 다시 확인하지 않는다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubServer('/api/auth/login', () => rateLimitedResponse('/api/auth/login'));

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMITED_MESSAGE);
    expect(screen.getByTestId('location').textContent).toBe('/login');
    // 4xxは処理されていないことが確実な失敗のため、起動時の1回だけ。
    expect(callsTo('/api/auth/me')).toBe(1);
    // ログイン失敗時と同じくパスワードは空になり、入力し直せば再試行できる
    // (制限が解けた後に、画面を開き直さずに再試行できる)。
    expect(screen.getByLabelText('パスワード')).toHaveValue('');
    await userEvent.setup().type(screen.getByLabelText('パスワード'), 'password123');
    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled());
  });

  test('429 본문이 JSON이 아니어도 기본 메시지를 표시하고 화면이 멈추지 않는다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    // Nginxの設定ミスなどで、既定のHTMLのエラーページが返った場合。
    stubServer('/api/auth/login', () => new Response('<html><body>429 Too Many Requests</body></html>', {
      status: 429,
      headers: { 'Content-Type': 'text/html' },
    }));

    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('로그인에 실패했습니다.');
    expect(screen.getByTestId('location').textContent).toBe('/login');
    expect(callsTo('/api/auth/me')).toBe(1);
  });
});

describe('会員登録が回数制限で拒否された場合', () => {
  test('429를 받으면 Nginx의 메시지를 표시하고, 입력한 비밀번호를 유지하며, /me로 다시 확인하지 않는다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubServer('/api/auth/signup', () => rateLimitedResponse('/api/auth/signup'));

    await submitSignup();

    expect(await screen.findByRole('alert')).toHaveTextContent(RATE_LIMITED_MESSAGE);
    expect(screen.getByTestId('location').textContent).toBe('/signup');
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');
    expect(callsTo('/api/auth/me')).toBe(1);
  });
});
