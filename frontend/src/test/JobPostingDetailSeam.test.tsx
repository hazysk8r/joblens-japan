import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 求人の詳細画面から通信までのつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → jobPostingApi → apiClient → AuthProvider は実際のコード)。
 * jobPostingApiをmockするテストでは、実際のURL、404の本文からApiErrorへの変換、
 * 401からログイン画面への移動は確認できない。
 */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const jobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  originalText: '原文',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

// ログイン済みのユーザー1で始まり、求人の取得だけをテストごとに変えるサーバー。
// 求人の取得が401になった後は、実際のサーバーと同じく照会(/me)も401にする。
function stubServer(jobPostingResponse: () => Response) {
  let expired = false;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/me') {
      return expired
        ? json(401, { code: 'UNAUTHORIZED' })
        : json(200, { id: 1, email: 'test-user@example.com' });
    }
    if (url === '/api/job-postings/5') {
      const response = jobPostingResponse();
      expired = response.status === 401;
      return response;
    }
    return json(500, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function LocationDisplay() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="state">{JSON.stringify(location.state)}</div>
    </>
  );
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('求人の詳細画面', () => {
  test('求人のAPIを取り消し用のsignal付きで呼び、応答を表示する', async () => {
    stubServer(() => json(200, jobPosting));

    renderApp('/job-postings/5');

    expect(await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' }))
      .toBeInTheDocument();
    const call = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/job-postings/5');
    expect(call?.[1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  test('404の本文を受けると見つからないと表示する', async () => {
    stubServer(() => json(404, {
      status: 404,
      code: 'JOB_POSTING_NOT_FOUND',
      message: '求人が見つかりません。',
      path: '/api/job-postings/5',
      fieldErrors: {},
    }));

    renderApp('/job-postings/5');

    expect(await screen.findByText('求人が見つかりません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });

  test('401を受けるとログイン画面へ移動し、ログイン後の戻り先は詳細画面になる', async () => {
    stubServer(() => json(401, { status: 401, code: 'UNAUTHORIZED', message: 'ログインが必要です。' }));

    renderApp('/job-postings/5');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(JSON.parse(screen.getByTestId('state').textContent!))
      .toEqual({ from: '/job-postings/5' });
  });
});
