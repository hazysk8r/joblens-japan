import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { apiFetch, switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * アカウント削除の画面 → AuthProvider → authApi → apiClient → fetch のつながりを検証する。
 *
 * 削除の結果ごとに、認証状態と移動先・案内が正しく決まることを確かめる。mockするのはfetchだけ。
 */

const DELETE_URL = '/api/auth/account/delete';
const AUTH_CHANGED_KEY = 'joblens.auth-changed';
const userA = { id: 1, email: 'user-a@example.com' };
const userB = { id: 2, email: 'user-b@example.com' };
const emptyPage = { content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true };
const emptySummary = { saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}): Response {
  return jsonResponse(status, { status, code, message, path: DELETE_URL, fieldErrors });
}

type Server = {
  // 削除の応答。Promiseを返すと、応答を待たせられる。
  deleteResponse: () => Response | Promise<Response>;
  // 削除リクエストの後の/meの応答。
  meAfterDelete?: () => Response | Promise<Response>;
};

// ユーザーAでログイン中のサーバーを再現する。
function stubServer(server: Server) {
  let deleteRequested = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (pathname === DELETE_URL && method === 'POST') {
      deleteRequested = true;
      return server.deleteResponse();
    }
    if (pathname === '/api/auth/me') {
      return deleteRequested && server.meAfterDelete ? server.meAfterDelete() : jsonResponse(200, userA);
    }
    if (pathname === '/api/auth/login' && method === 'POST') return jsonResponse(200, userB);
    if (pathname === '/api/job-postings/status-summary') return jsonResponse(200, emptySummary);
    if (pathname === '/api/job-postings') return jsonResponse(200, emptyPage);
    return jsonResponse(404, {});
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function LocationDisplay() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-state">{JSON.stringify(location.state ?? null)}</div>
    </>
  );
}

function renderApp(path = '/account') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function callsTo(pathname: string, method = 'GET'): number {
  return vi.mocked(fetch).mock.calls.filter(([url, init]) =>
    new URL(String(url), 'http://localhost').pathname === pathname
    && ((init as RequestInit | undefined)?.method ?? 'GET') === method).length;
}

async function submitDeletion(password = 'password123') {
  const user = userEvent.setup();
  renderApp();
  await user.type(await screen.findByLabelText('パスワード'), password);
  await user.click(screen.getByRole('button', { name: 'アカウントを削除する' }));
  return user;
}

function location() {
  return screen.getByTestId('location').textContent;
}

beforeEach(() => {
  document.cookie = 'XSRF-TOKEN=token-1; path=/';
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
  localStorage.clear();
});

describe('アカウント設定の画面', () => {
  test('アカウントバーのリンクから開け、メールアドレスと削除の注意を表示する', async () => {
    stubServer({ deleteResponse: () => new Response(null, { status: 204 }) });
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'アカウント設定' }));

    expect(location()).toBe('/account');
    expect(screen.getByRole('heading', { name: 'アカウントの削除', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(userA.email, { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(/元に戻せません/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 求人一覧に戻る' })).toHaveAttribute('href', '/');
  });

  test('パスワード管理ツールのため、メールアドレスをusernameとして持ち、パスワードはcurrent-passwordにする', async () => {
    stubServer({ deleteResponse: () => new Response(null, { status: 204 }) });
    renderApp();

    const password = await screen.findByLabelText('パスワード');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    const username = document.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue(userA.email);
  });

  test('パスワードが空の間は削除できない', async () => {
    stubServer({ deleteResponse: () => new Response(null, { status: 204 }) });
    renderApp();

    expect(await screen.findByRole('button', { name: 'アカウントを削除する' })).toBeDisabled();
  });

  test('削除中はボタンを無効にし、二重に送らない', async () => {
    const response = deferred<Response>();
    stubServer({ deleteResponse: () => response.promise });
    const user = await submitDeletion();

    const button = screen.getByRole('button', { name: '削除中…' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(callsTo(DELETE_URL, 'POST')).toBe(1);

    response.resolve(new Response(null, { status: 204 }));
    await waitFor(() => expect(location()).toBe('/login'));
  });

  test('リクエストにパスワード・CSRFトークン・画面のユーザーを付ける', async () => {
    stubServer({ deleteResponse: () => new Response(null, { status: 204 }) });
    await submitDeletion('my-password');

    await waitFor(() => expect(callsTo(DELETE_URL, 'POST')).toBe(1));
    const [, init] = vi.mocked(fetch).mock.calls.find(([url]) => url === DELETE_URL)!;
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'my-password' });
    expect(init?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'token-1', 'X-Expected-User-Id': '1' });
  });
});

describe('削除の結果', () => {
  test('204なら/meで確認してからaccountDeletedになり、戻り先なしでログイン画面へ移動して他のタブに知らせる', async () => {
    stubServer({
      deleteResponse: () => new Response(null, { status: 204 }),
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    await submitDeletion();

    expect(await screen.findByText('アカウントを削除しました。')).toBeInTheDocument();
    expect(location()).toBe('/login');
    expect(screen.getByTestId('location-state').textContent).toBe('null');
    // CSRFトークンを受け取り直すための確認(起動時の1回と合わせて2回)。
    expect(callsTo('/api/auth/me')).toBe(2);
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).not.toBeNull();
  });

  test('204を受け取った時点で、進行中の以前のリクエストを/meの確認を待たずに取り消す', async () => {
    const me = deferred<Response>();
    stubServer({
      deleteResponse: () => new Response(null, { status: 204 }),
      meAfterDelete: () => me.promise,
    });
    renderApp();
    const passwordInput = await screen.findByLabelText('パスワード');

    // 削除の前に送り、応答が届いていないリクエスト(削除したユーザーの画面のもの)。
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal?.addEventListener('abort', () => reject((init as RequestInit).signal?.reason));
    }));
    const previous = apiFetch('/api/job-postings').then(() => 'completed', (caught: Error) => caught.name);

    const user = userEvent.setup();
    await user.type(passwordInput, 'password123');
    await user.click(screen.getByRole('button', { name: 'アカウントを削除する' }));

    await expect(previous).resolves.toBe('AuthContextChangedError');
    me.resolve(jsonResponse(401, { code: 'UNAUTHORIZED' }));
    expect(await screen.findByText('アカウントを削除しました。')).toBeInTheDocument();
  });

  test('204の後の/meが失敗しても、削除は確定する', async () => {
    stubServer({
      deleteResponse: () => new Response(null, { status: 204 }),
      meAfterDelete: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await submitDeletion();

    expect(await screen.findByText('アカウントを削除しました。')).toBeInTheDocument();
  });

  test('204の後の/meが別のユーザーなら、そのユーザーに合わせる(別のタブでログインされた場合)', async () => {
    stubServer({
      deleteResponse: () => new Response(null, { status: 204 }),
      meAfterDelete: () => jsonResponse(200, userB),
    });
    await submitDeletion();

    await waitFor(() => expect(screen.getByText(userB.email)).toBeInTheDocument());
    expect(location()).toBe('/');
    expect(screen.queryByText('アカウントを削除しました。')).not.toBeInTheDocument();
  });

  test('削除後に別のアカウントでログインすると、アカウント設定ではなくトップへ移動し、案内を残さない', async () => {
    stubServer({
      deleteResponse: () => new Response(null, { status: 204 }),
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    const user = await submitDeletion();
    await screen.findByText('アカウントを削除しました。');
    document.cookie = 'XSRF-TOKEN=token-2; path=/';

    await user.type(screen.getByLabelText('メールアドレス'), userB.email);
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(location()).toBe('/'));
    expect(screen.queryByText('アカウントを削除しました。')).not.toBeInTheDocument();
  });

  test('パスワードが違うと項目にエラーを表示し、入力を消してログイン状態のままにする', async () => {
    stubServer({
      deleteResponse: () => error(400, 'INVALID_PASSWORD', 'パスワードが正しくありません。',
        { password: 'パスワードが正しくありません。' }),
    });
    await submitDeletion();

    const password = screen.getByLabelText('パスワード');
    await waitFor(() => expect(password).toHaveAccessibleDescription('パスワードが正しくありません。'));
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveValue('');
    // ボタンで送信して無効になった後も、読み上げと再入力のためにパスワードの欄へ戻す。
    expect(password).toHaveFocus();
    expect(location()).toBe('/account');
    expect(callsTo('/api/auth/me')).toBe(1);
  });

  // 403のCSRF_TOKEN_INVALIDでは、apiClientが次の操作のためにトークンだけを/meで取り直す。
  test.each([
    ['429', () => error(429, 'TOO_MANY_REQUESTS', 'リクエストが多すぎます。しばらくしてから再度お試しください。'),
      'リクエストが多すぎます。しばらくしてから再度お試しください。', 1],
    ['403', () => error(403, 'CSRF_TOKEN_INVALID', 'リクエストを確認できませんでした。'), 'リクエストを確認できませんでした。', 2],
  ])('%sならメッセージを表示し、ログイン状態のままにする', async (_status, response, message, meCalls) => {
    stubServer({ deleteResponse: response });
    await submitDeletion();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(location()).toBe('/account');
    expect(callsTo('/api/auth/me')).toBe(meCalls);
  });

  test('削除のリクエスト自体が401なら、通常の期限切れとして扱う', async () => {
    stubServer({
      deleteResponse: () => error(401, 'UNAUTHORIZED', 'ログインが必要です。'),
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    await submitDeletion();

    expect(await screen.findByText('セッションの有効期限が切れました。再度ログインしてください。')).toBeInTheDocument();
    expect(screen.queryByText('アカウントを削除しました。')).not.toBeInTheDocument();
  });

  test('409 AUTH_CONTEXT_CHANGEDなら、現在のセッションのユーザーに合わせる', async () => {
    stubServer({
      deleteResponse: () => error(409, 'AUTH_CONTEXT_CHANGED', 'ログイン状態が変わりました。'),
      meAfterDelete: () => jsonResponse(200, userB),
    });
    await submitDeletion();

    await waitFor(() => expect(screen.getByText(userB.email)).toBeInTheDocument());
    expect(location()).toBe('/');
  });

  test('5xxで/meが同じユーザーなら、削除されていないことを伝えてログイン状態のままにする', async () => {
    stubServer({
      deleteResponse: () => error(500, 'INTERNAL_SERVER_ERROR', 'サーバーで問題が発生しました。'),
    });
    await submitDeletion();

    expect(await screen.findByRole('alert')).toHaveTextContent('アカウントを削除できませんでした。');
    expect(location()).toBe('/account');
    expect(callsTo('/api/auth/me')).toBe(2);
  });

  test('5xxで/meが未ログインなら、削除されたと断定せず確認できなかったことを伝える', async () => {
    stubServer({
      deleteResponse: () => error(500, 'INTERNAL_SERVER_ERROR', 'サーバーで問題が発生しました。'),
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    await submitDeletion();

    expect(await screen.findByText(/アカウントの削除を確認できませんでした。/)).toBeInTheDocument();
    expect(location()).toBe('/login');
    expect(screen.getByTestId('location-state').textContent).toBe('null');
    expect(screen.queryByText('アカウントを削除しました。')).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).not.toBeNull();
  });

  test('応答がなく/meが別のユーザーなら、そのユーザーに合わせる', async () => {
    stubServer({
      deleteResponse: () => {
        throw new TypeError('Failed to fetch');
      },
      meAfterDelete: () => jsonResponse(200, userB),
    });
    await submitDeletion();

    await waitFor(() => expect(screen.getByText(userB.email)).toBeInTheDocument());
    expect(location()).toBe('/');
  });

  test('応答がなく/meも失敗すると、確認できなかったことを伝えてログイン状態のままにする', async () => {
    stubServer({
      deleteResponse: () => {
        throw new TypeError('Failed to fetch');
      },
      meAfterDelete: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await submitDeletion();

    expect(await screen.findByRole('alert')).toHaveTextContent('アカウントを削除できたか確認できませんでした。');
    expect(location()).toBe('/account');
  });
});

describe('削除中に届いた他のリクエストの401', () => {
  test('削除の結果を待ち、削除できた場合はaccountDeletedにする', async () => {
    const response = deferred<Response>();
    stubServer({
      deleteResponse: () => response.promise,
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    await submitDeletion();
    await waitFor(() => expect(callsTo(DELETE_URL, 'POST')).toBe(1));

    // サーバーで削除が終わり、別のリクエストが先に401を受け取った場合。
    vi.mocked(fetch).mockImplementationOnce(async () => jsonResponse(401, { code: 'UNAUTHORIZED' }));
    await apiFetch('/api/job-postings').catch(() => undefined);
    expect(location()).toBe('/account');

    response.resolve(new Response(null, { status: 204 }));
    expect(await screen.findByText('アカウントを削除しました。')).toBeInTheDocument();
  });

  test('削除が拒否された場合は、無視した401について/meで確認し直す', async () => {
    const response = deferred<Response>();
    stubServer({
      deleteResponse: () => response.promise,
      meAfterDelete: () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    });
    await submitDeletion();
    await waitFor(() => expect(callsTo(DELETE_URL, 'POST')).toBe(1));

    vi.mocked(fetch).mockImplementationOnce(async () => jsonResponse(401, { code: 'UNAUTHORIZED' }));
    await apiFetch('/api/job-postings').catch(() => undefined);

    response.resolve(error(400, 'INVALID_PASSWORD', 'パスワードが正しくありません。',
      { password: 'パスワードが正しくありません。' }));

    expect(await screen.findByText('セッションの有効期限が切れました。再度ログインしてください。')).toBeInTheDocument();
  });
});
