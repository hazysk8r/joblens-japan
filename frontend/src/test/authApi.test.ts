import { afterEach, describe, expect, test, vi } from 'vitest';

import { switchAuthContext } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { login, signup } from '../api/authApi';

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
  { name: '로그인', run: login, url: '/api/auth/login', successStatus: 200 },
  { name: '회원가입', run: signup, url: '/api/auth/signup', successStatus: 201 },
];

describe.each(operations)('$name', ({ run, url, successStatus }) => {
  test('JSON 본문 {email, password}를 POST로, CSRF 토큰과 함께 보낸다', async () => {
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

  test('성공하면 서버가 돌려준 사용자를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(successStatus, { id: 7, email: 'user7@example.com' }),
    ));

    await expect(run('user7@example.com', 'password123'))
      .resolves.toEqual({ id: 7, email: 'user7@example.com' });
  });

  test.each([
    { status: 400, body: { code: 'VALIDATION_FAILED', message: '입력값이 올바르지 않습니다.', fieldErrors: { email: '이메일 형식이 올바르지 않습니다.' } } },
    { status: 401, body: { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' } },
    { status: 403, body: { code: 'CSRF_TOKEN_INVALID', message: '요청을 확인할 수 없습니다.' } },
    { status: 409, body: { code: 'EMAIL_ALREADY_EXISTS', message: '이미 가입된 이메일입니다.' } },
  ])('서버가 $status 응답을 반환하면 처리되지 않은 것이 확실한 ApiError를 던진다', async ({ status, body }) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(status, body)));

    const error = await run('user@example.com', 'password123').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code: body.code, message: body.message });
  });

  test('성공 응답의 본문 형식이 다르면 ApiError가 아닌 오류를 던진다(서버에서는 처리됐을 수 있음)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(successStatus, { id: '7', email: 'user7@example.com' }),
    ));

    const error = await run('user7@example.com', 'password123').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
