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
