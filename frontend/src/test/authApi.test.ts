import { afterEach, describe, expect, test, vi } from 'vitest';

import { switchAuthContext } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { login, logout, signup } from '../api/authApi';

/**
 * 認証APIが送るリクエストの形式と、応答の分類を検証する。
 *
 * 画面のテストはauthApiをモジュールごとmockするため、
 * 実際に送るURL・メソッド・本文はここで確認する(バックエンドのSignupRequest・LoginRequestと同じ形)。
 */

const CSRF_HEADER = 'X-XSRF-TOKEN';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastRequest(): { url: string; init: RequestInit } {
  const calls = vi.mocked(fetch).mock.calls;
  const [url, init] = calls[calls.length - 1];
  return { url: String(url), init: init ?? {} };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

const operations = [
  { name: 'ログイン', run: login, url: '/api/auth/login', successStatus: 200 },
  { name: '会員登録', run: signup, url: '/api/auth/signup', successStatus: 201 },
];

describe.each(operations)('$name', ({ run, url, successStatus }) => {
  test('JSON本文{email, password}をPOSTで、CSRFトークンと一緒に送る', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(successStatus, { id: 1, email: 'user@example.com' }),
    ));

    // パスワードの前後の空白も、パスワードの一部としてそのまま送る。
    await run('user@example.com', ' pass word ');

    const { url: requestUrl, init } = lastRequest();
    expect(requestUrl).toBe(url);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      [CSRF_HEADER]: 'token-1',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'user@example.com',
      password: ' pass word ',
    });
  });

  test('成功するとサーバーが返したユーザーを返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(successStatus, { id: 7, email: 'user7@example.com' }),
    ));

    await expect(run('user7@example.com', 'password123'))
      .resolves.toEqual({ id: 7, email: 'user7@example.com' });
  });

  test.each([
    { status: 400, body: { code: 'VALIDATION_FAILED', message: '入力値が正しくありません。', fieldErrors: { email: 'メールアドレスの形式が正しくありません。' } } },
    { status: 401, body: { code: 'INVALID_CREDENTIALS', message: 'メールアドレスまたはパスワードが正しくありません。' } },
    { status: 403, body: { code: 'CSRF_TOKEN_INVALID', message: 'リクエストを確認できませんでした。' } },
    { status: 409, body: { code: 'EMAIL_ALREADY_EXISTS', message: 'このメールアドレスはすでに登録されています。' } },
  ])('サーバーが$statusの応答を返すと、処理されていないことが確実なApiErrorを投げる', async ({ status, body }) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(status, body)));

    const error = await run('user@example.com', 'password123').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code: body.code, message: body.message });
  });

  test('成功応答の本文の形式が違うとApiErrorではないエラーを投げる(サーバーでは処理された可能性がある)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(successStatus, { id: '7', email: 'user7@example.com' }),
    ));

    const error = await run('user7@example.com', 'password123').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe('ログアウト', () => {
  test('POST /api/auth/logoutをCSRFトークンと一緒に送り、204なら正常に終わる', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(logout()).resolves.toBeUndefined();

    const { url, init } = lastRequest();
    expect(url).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ [CSRF_HEADER]: 'token-1' });
  });

  test.each([403, 500])('サーバーが%iの応答を返すとステータスコードを持つApiErrorを投げる', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(status, { message: '失敗' })));

    const error = await logout().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status });
  });
});
