import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 保存件数と登録者数の上限に達した場合の、画面までのつながりを検証する。
 *
 * codeとmessageはGlobalExceptionHandlerの応答と同じ値を使う。mockするのはfetchだけ。
 */

const SIGNUP_CLOSED_MESSAGE = '現在、新規登録を受け付けていません。';
const POSTING_LIMIT_MESSAGE = '登録できる求人は100件までです。';
const MEMO_LIMIT_MESSAGE = 'メモは1つの求人につき50件までです。';

const posting = {
  id: 1,
  companyName: '東京テック',
  title: 'Java求人',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-10-17T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function conflict(code: string, message: string, path: string): Response {
  return jsonResponse(409, { status: 409, code, message, path, fieldErrors: {} });
}

function requestsTo(pathname: string, method: string) {
  return vi.mocked(fetch).mock.calls.filter(([url, init]) =>
    new URL(String(url), 'http://localhost').pathname === pathname
    && ((init as RequestInit | undefined)?.method ?? 'GET') === method);
}

// ログイン中で求人が1件あり、登録だけが上限で拒否されるサーバーを再現する。
function stubLoggedInServer() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';

    if (pathname === '/api/auth/me') return jsonResponse(200, { id: 1, email: 'user@example.com' });
    if (pathname === '/api/job-postings/status-summary') {
      return jsonResponse(200, { saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    if (pathname === '/api/job-postings' && method === 'POST') {
      return conflict('JOB_POSTING_LIMIT_REACHED', POSTING_LIMIT_MESSAGE, pathname);
    }
    if (pathname === '/api/job-postings') {
      return jsonResponse(200, {
        content: [posting], page: 0, size: 5, totalElements: 1, totalPages: 1, first: true, last: true,
      });
    }
    if (pathname === '/api/job-postings/1/notes' && method === 'POST') {
      return conflict('MEMO_LIMIT_REACHED', MEMO_LIMIT_MESSAGE, pathname);
    }
    if (pathname === '/api/job-postings/1/notes') return jsonResponse(200, []);
    return jsonResponse(404, {});
  }));
}

function stubSignupClosedServer() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return jsonResponse(401, { code: 'UNAUTHORIZED' });
    if (url === '/api/auth/signup') return conflict('SIGNUP_CLOSED', SIGNUP_CLOSED_MESSAGE, url);
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

describe('会員登録の上限', () => {
  test('上限に達していると登録画面にメッセージを表示し、/meで再確認しない', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubSignupClosedServer();
    const user = userEvent.setup();
    renderApp('/signup');

    await user.type(await screen.findByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.type(screen.getByLabelText('パスワード（確認）'), 'password123');
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SIGNUP_CLOSED_MESSAGE);
    expect(screen.getByTestId('location').textContent).toBe('/signup');
    // 4xxは処理されていないことが確実な失敗のため、起動時の1回だけ。
    expect(requestsTo('/api/auth/me', 'GET')).toHaveLength(1);
    // 入力し直さずに再試行できるよう、パスワードは消さない。
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');
  });
});

describe('登録画面の案内', () => {
  test('保存する情報、再設定できないこと、問い合わせ先を表示する', async () => {
    stubSignupClosedServer();
    renderApp('/signup');

    const notice = await screen.findByRole('note', { name: '登録情報について' });

    // 文の間に半角スペースが入らないことも確かめるため、全文で比べる。
    expect(notice.textContent).toBe(
      'メールアドレスと、登録した求人の情報を保存します。確認メールは送らないため、実在しないメールアドレスでも登録できます。パスワードを忘れても再設定はできません。お問い合わせはGitHubのIssuesへお願いします。',
    );
    const link = within(notice).getByRole('link', { name: 'GitHubのIssues' });
    expect(link).toHaveAttribute('href', 'https://github.com/hazysk8r/joblens-japan/issues');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  test('ログイン画面には表示しない', async () => {
    stubSignupClosedServer();
    renderApp('/login');

    await screen.findByLabelText('メールアドレス');

    expect(screen.queryByRole('note', { name: '登録情報について' })).not.toBeInTheDocument();
  });
});

describe('保存件数の上限', () => {
  test('求人が上限に達していると、登録画面にサーバーのメッセージを表示して留まる', async () => {
    stubLoggedInServer();
    const user = userEvent.setup();
    renderApp('/job-postings/new');

    await user.type(await screen.findByLabelText('求人タイトル'), 'Java求人');
    await user.type(screen.getByLabelText('求人原文'), '求人の原文');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(POSTING_LIMIT_MESSAGE);
    expect(screen.getByTestId('location').textContent).toBe('/job-postings/new');
    expect(screen.getByLabelText('求人タイトル')).toHaveValue('Java求人');
    expect(requestsTo('/api/job-postings', 'POST')).toHaveLength(1);
  });

  test('メモが上限に達していると、サーバーのメッセージを表示して入力を残す', async () => {
    stubLoggedInServer();
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('heading', { name: posting.title, level: 2 });
    await user.type(screen.getByLabelText('メモ内容'), '面接前に確認する');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MEMO_LIMIT_MESSAGE);
    expect(screen.getByLabelText('メモ内容')).toHaveValue('面接前に確認する');
    expect(requestsTo('/api/job-postings/1/notes', 'POST')).toHaveLength(1);
  });
});
