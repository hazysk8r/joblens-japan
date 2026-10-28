import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { apiFetch, switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 画面 → AuthProvider → authApi → apiClient → fetch のつながりを検証する。
 *
 * 他の画面テストはauthApiをmockするため、画面が正しい認証APIを呼び、
 * 実際のリクエストとapiClientの認証状態の切り替えまで届くことは、ここでしか確認できない。
 * mockするのはfetchだけ。
 */

const CSRF_HEADER = 'X-XSRF-TOKEN';
const EXPECTED_USER_HEADER = 'X-Expected-User-Id';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const emptyPage = {
  content: [],
  page: 0,
  size: 5,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
};
const emptySummary = { saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0 };

// 未ログインの状態から始まるサーバーを再現する。
function stubServer(authUrl: string, authResponse: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return jsonResponse(401, { code: 'UNAUTHORIZED' });
    if (url === authUrl) return authResponse();
    if (url.startsWith('/api/job-postings/status-summary')) return jsonResponse(200, emptySummary);
    if (url.startsWith('/api/job-postings?')) return jsonResponse(200, emptyPage);
    return jsonResponse(201, {});
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

function requestTo(url: string): RequestInit {
  const call = vi.mocked(fetch).mock.calls.find(([requestUrl]) => requestUrl === url);
  expect(call, `${url} への送信がない`).toBeDefined();
  return call![1] ?? {};
}

async function expectedUserOfNextMutation(): Promise<string | undefined> {
  await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
  const calls = vi.mocked(fetch).mock.calls;
  const headers = calls[calls.length - 1][1]?.headers as Record<string, string> | undefined;
  return headers?.[EXPECTED_USER_HEADER];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

describe('画面から通信までのつながり', () => {
  test('회원가입 화면에서 가입하면 실제 요청이 올바르게 나가고, 이후 요청에 새 사용자 ID가 붙는다', async () => {
    // 起動時の/meでサーバーが発行したCSRFトークンのCookie。
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubServer('/api/auth/signup', () => jsonResponse(201, { id: 11, email: 'new@example.com' }));
    const user = userEvent.setup();

    renderApp('/signup');
    await user.type(await screen.findByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.type(screen.getByLabelText('パスワード（確認）'), 'password123');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const request = requestTo('/api/auth/signup');
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ [CSRF_HEADER]: 'token-1' });
    expect(JSON.parse(String(request.body))).toEqual({ email: 'new@example.com', password: 'password123' });
    await expect(expectedUserOfNextMutation()).resolves.toBe('11');
  });

  test('로그인 화면에서 로그인하면 실제 요청이 올바르게 나가고, 이후 요청에 새 사용자 ID가 붙는다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubServer('/api/auth/login', () => jsonResponse(200, { id: 12, email: 'user@example.com' }));
    const user = userEvent.setup();

    renderApp('/login');
    await user.type(await screen.findByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    const request = requestTo('/api/auth/login');
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ [CSRF_HEADER]: 'token-1' });
    expect(JSON.parse(String(request.body))).toEqual({ email: 'user@example.com', password: 'password123' });
    await expect(expectedUserOfNextMutation()).resolves.toBe('12');
  });
});

describe('ログアウトから次のログインまでのつながり', () => {
  const CSRF_COOKIE_CLEAR = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

  /*
   * 実際のサーバーと同じく、ログアウトでCSRFトークンのCookieを削除し、
   * その後の照会(/me)で新しいトークンを発行するサーバーを再現する。
   * (この動作はバックエンドのAuthControllerTestで確認している。)
   */
  function stubServerWithLogout(options: { failMeAfterLogout?: number } = {}) {
    let loggedIn = true;
    let issued = 1;
    let meFailuresLeft = options.failMeAfterLogout ?? 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/me') {
        if (loggedIn) return jsonResponse(200, { id: 1, email: 'user-a@example.com' });
        if (meFailuresLeft > 0) {
          meFailuresLeft -= 1;
          throw new TypeError('Failed to fetch');
        }
        issued += 1;
        document.cookie = `XSRF-TOKEN=token-${issued}; path=/`;
        return jsonResponse(401, { code: 'UNAUTHORIZED' });
      }
      if (url === '/api/auth/logout') {
        loggedIn = false;
        document.cookie = CSRF_COOKIE_CLEAR;
        return new Response(null, { status: 204 });
      }
      if (url === '/api/auth/login') return jsonResponse(200, { id: 2, email: 'user-b@example.com' });
      if (url.startsWith('/api/job-postings/status-summary')) return jsonResponse(200, emptySummary);
      if (url.startsWith('/api/job-postings?')) return jsonResponse(200, emptyPage);
      return jsonResponse(201, {});
    }));
  }

  function requestsTo(url: string): RequestInit[] {
    return vi.mocked(fetch).mock.calls
      .filter(([requestUrl]) => requestUrl === url)
      .map(([, init]) => init ?? {});
  }

  async function logoutThenLogin() {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(screen.getByText('ログアウトしました。')).toBeInTheDocument();

    // ページを再読み込みせずに、すぐ別のユーザーでログインする。
    await user.type(await screen.findByLabelText('メールアドレス'), 'user-b@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
  }

  test('로그아웃 직후 새로고침 없이 로그인해도 첫 시도에 새 토큰으로 성공한다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubServerWithLogout();

    await logoutThenLogin();

    expect(requestsTo('/api/auth/logout')[0].headers).toMatchObject({ [CSRF_HEADER]: 'token-1' });
    const loginRequests = requestsTo('/api/auth/login');
    // 403で失敗して2回目に成功するのではなく、1回目で成功している。
    expect(loginRequests).toHaveLength(1);
    expect(loginRequests[0].headers).toMatchObject({ [CSRF_HEADER]: 'token-2' });
  });

  test('로그아웃 204 후 /me 확인이 실패해도, 통신이 회복되면 첫 로그인 시도가 성공한다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    // ログアウト直後の確認(/me)だけが通信エラーになり、トークンを受け取れない。
    stubServerWithLogout({ failMeAfterLogout: 1 });

    await logoutThenLogin();

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    const logoutIndex = urls.indexOf('/api/auth/logout');
    // ログアウト → 確認に失敗 → ログインの前にトークンを取得 → ログイン
    expect(urls.slice(logoutIndex, logoutIndex + 4)).toEqual([
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/me',
      '/api/auth/login',
    ]);
    const loginRequests = requestsTo('/api/auth/login');
    expect(loginRequests).toHaveLength(1);
    expect(loginRequests[0].headers).toMatchObject({ [CSRF_HEADER]: 'token-2' });
  });
});
