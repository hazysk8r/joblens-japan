import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  AuthContextChangedError,
  CsrfTokenUnavailableError,
  apiFetch,
  switchAuthContext,
} from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/useAuth';
import type { AuthContextValue } from '../auth/authContext';

/**
 * 実際のAuthProviderと実際のapiClientを組み合わせ、fetchだけを差し替えて検証する。
 *
 * 画面の状態(Context)だけでなく、apiClient側の認証状態(送信するユーザーIDや世代)まで
 * 正しく切り替わることを確認するため、APIモジュールはmockしない。
 */

const EXPECTED_USER_HEADER = 'X-Expected-User-Id';

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const user = (id: number) => ({ id, email: `user${id}@example.com` });
const meUnauthorized = () => jsonResponse(401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// signalで中断されるまで応答しない、通信中のリクエストを再現する。
function pendingUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

function stubFetch(handler: FetchHandler) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handler(url, init)));
}

function fetchedUrls(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url]) => String(url));
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function renderAuth(options: { reactStrictMode?: boolean } = {}) {
  return renderHook(() => useAuth(), { wrapper, ...options });
}

// 変更リクエストを送り、付いた予想ユーザーヘッダーを返す。
async function expectedUserOfNextMutation(): Promise<string | undefined> {
  await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
  const calls = vi.mocked(fetch).mock.calls;
  const headers = calls[calls.length - 1][1]?.headers as Record<string, string> | undefined;
  return headers?.[EXPECTED_USER_HEADER];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // 他のテストにログイン中のユーザーを残さない。
  switchAuthContext(null);
});

describe('起動時のログイン状態の確認', () => {
  test('/me가 사용자를 반환하면 authenticated가 되고, 이후 변경 요청에 그 사용자 ID가 붙는다', async () => {
    stubFetch((url) => (url === '/api/auth/me' ? jsonResponse(200, user(7)) : jsonResponse(201, {})));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(7) }));
    await expect(expectedUserOfNextMutation()).resolves.toBe('7');
  });

  test('/me가 401이면 만료가 아닌 anonymous가 되고, 변경 요청에 예상 사용자 헤더가 붙지 않는다', async () => {
    stubFetch((url) => (url === '/api/auth/me' ? meUnauthorized() : jsonResponse(201, {})));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' }));
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('/me가 500이면 anonymous가 아니라 error가 되고, retry 후 성공하면 authenticated가 된다', async () => {
    const responses = [jsonResponse(500, { message: '서버 오류' }), jsonResponse(200, user(7))];
    stubFetch(() => responses.shift()!);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(7) }));
  });

  test('/me가 오프라인으로 실패하면 error가 된다', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('/me가 끝나기 전에는 loading이고, /me 외의 요청은 보내지 않는다', async () => {
    const me = deferred<Response>();
    stubFetch(() => me.promise);

    const { result } = renderAuth();

    expect(result.current.state).toEqual({ status: 'loading' });
    me.resolve(jsonResponse(200, user(7)));
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
    expect(fetchedUrls().every((url) => url === '/api/auth/me')).toBe(true);
  });

  test('StrictMode에서도 최종 사용자와 예상 사용자 헤더가 일치한다', async () => {
    stubFetch((url) => (url === '/api/auth/me' ? jsonResponse(200, user(9)) : jsonResponse(201, {})));

    const { result } = renderAuth({ reactStrictMode: true });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(9) }));
    await expect(expectedUserOfNextMutation()).resolves.toBe('9');
  });
});

// ログインと会員登録は同じ認証の流れ(AuthProviderのauthenticate)を通るため、同じ観点で両方を検証する。
const authOperations: {
  name: string;
  url: string;
  run: (auth: AuthContextValue, email: string, password: string) => Promise<void>;
  successResponse: (id: number) => Response;
  // サーバーが失敗を返した(処理されていないことが確実な)応答。
  certainFailure: () => Response;
  certainFailureCode: string;
}[] = [
  {
    name: 'ログイン',
    url: '/api/auth/login',
    run: (auth, email, password) => auth.login(email, password),
    successResponse: (id) => jsonResponse(200, user(id)),
    certainFailure: () => jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
    certainFailureCode: 'INVALID_CREDENTIALS',
  },
  {
    name: '会員登録',
    url: '/api/auth/signup',
    run: (auth, email, password) => auth.signup(email, password),
    successResponse: (id) => jsonResponse(201, user(id)),
    certainFailure: () => jsonResponse(409, { code: 'EMAIL_ALREADY_EXISTS', message: '이미 가입된 이메일입니다.' }),
    certainFailureCode: 'EMAIL_ALREADY_EXISTS',
  },
];

describe.each(authOperations)('$name', ({ url, run, successResponse, certainFailure, certainFailureCode }) => {
  test('시작하면 진행 중이던 요청이 취소되고, 성공 후의 변경 요청에는 새 사용자 ID가 붙는다', async () => {
    stubFetch((requestUrl, init) => {
      if (requestUrl === '/api/auth/me') return meUnauthorized();
      if (requestUrl === url) return successResponse(3);
      if (requestUrl === '/api/job-postings/status-summary') return pendingUntilAborted(init);
      return jsonResponse(201, {});
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    // 認証前の状態で送り、まだ応答が届いていないリクエスト。
    // 認証中に中断されるため、結果を先に受け取っておく(未処理の拒否にしない)。
    const previousRequest = apiFetch('/api/job-postings/status-summary')
      .catch((error: unknown) => error);
    await act(async () => {
      await run(result.current, 'user3@example.com', 'password123');
    });

    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(3) });
    // 別の認証APIに送っていないことも確認する。
    expect(fetchedUrls()).toContain(url);
    await expect(expectedUserOfNextMutation()).resolves.toBe('3');
  });

  test('이전 요청은 응답을 기다리지 않고 시작한 시점에 취소된다', async () => {
    const authResponse = deferred<Response>();
    stubFetch((requestUrl, init) => {
      if (requestUrl === '/api/auth/me') return meUnauthorized();
      if (requestUrl === url) return authResponse.promise;
      return pendingUntilAborted(init);
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    const previousRequest = apiFetch('/api/job-postings/status-summary')
      .catch((error: unknown) => error);
    let done!: Promise<void>;
    act(() => {
      done = run(result.current, 'user3@example.com', 'password123');
    });

    // 認証の応答が届く前に、すでに中断されている。
    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);

    await act(async () => {
      authResponse.resolve(successResponse(3));
      await done;
    });
  });

  // 認証はログインしていない状態で始まるため、その間の401は新しいことを示さず、無視する。
  test('진행 중(로그인 전 상태)에 다른 요청의 401이 와도 무시하고, 인증 결과를 그대로 따른다', async () => {
    const authResponse = deferred<Response>();
    stubFetch((requestUrl) => {
      if (requestUrl === '/api/auth/me') return meUnauthorized();
      if (requestUrl === url) return authResponse.promise;
      return meUnauthorized();
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let done!: Promise<unknown>;
    act(() => {
      done = run(result.current, 'user3@example.com', 'password123')
        .catch((error: unknown) => error);
    });
    await act(async () => {
      await apiFetch('/api/job-postings');
    });
    await act(async () => {
      authResponse.resolve(successResponse(3));
      await done;
    });

    await expect(done).resolves.toBeUndefined();
    // 401による再確認(/me)は行われていない。
    expect(fetchedUrls()).toEqual(['/api/auth/me', url, '/api/job-postings']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(3) });
  });

  test('서버가 실패를 반환하면 anonymous를 유지하고 오류를 전달하며, /me 확인과 만료 처리는 하지 않는다', async () => {
    stubFetch((requestUrl) => (requestUrl === '/api/auth/me' ? meUnauthorized() : certainFailure()));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let error: unknown;
    await act(async () => {
      error = await run(result.current, 'user@example.com', 'password123').catch((cause: unknown) => cause);
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: certainFailureCode });
    expect(fetchedUrls()).toEqual(['/api/auth/me', url]);
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' });
  });

  // 5xxは、サーバーで処理が終わった後にも起こり得る(例: セッション作成後の500、プロキシの502・504)。
  test.each([500, 502, 504])('서버가 %i를 반환하면 다시 보내지 않고 /me로 확인해 상태를 정한다', async (status) => {
    const meResponses = [meUnauthorized(), jsonResponse(200, user(6))];
    stubFetch((requestUrl) => (requestUrl === '/api/auth/me'
      ? meResponses.shift()!
      : jsonResponse(status, { message: '서버 오류' })));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    await act(async () => {
      await run(result.current, 'user6@example.com', 'password123');
    });

    expect(fetchedUrls()).toEqual(['/api/auth/me', url, '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(6) });
  });

  test('CSRF 토큰을 받지 못해 요청을 보내지 않았으면 /me 확인 없이 오류를 전달한다', async () => {
    stubFetch(() => meUnauthorized());
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));
    // ログアウト直後などで、トークンのCookieがなく、取り直しても発行されない状況。
    document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    let error: unknown;
    await act(async () => {
      error = await run(result.current, 'user@example.com', 'password123').catch((cause: unknown) => cause);
    });

    expect(error).toBeInstanceOf(CsrfTokenUnavailableError);
    // 認証リクエストは送られておらず、確認(/me)も追加で送らない(トークン取得の1回だけ)。
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/me']);
    expect(result.current.state.status).toBe('anonymous');
  });

  test('응답을 받지 못하면 요청을 다시 보내지 않고 /me로 확인해 상태를 정한다', async () => {
    const meResponses = [meUnauthorized(), jsonResponse(200, user(5))];
    stubFetch((requestUrl) => (requestUrl === '/api/auth/me'
      ? meResponses.shift()!
      // サーバーでは処理が完了したが、応答が届く前に通信が切れた場合。
      : Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    await act(async () => {
      await run(result.current, 'user5@example.com', 'password123');
    });

    expect(fetchedUrls()).toEqual(['/api/auth/me', url, '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(5) });
  });

  test('응답을 받지 못했고 /me도 로그인 전이면 원래 오류를 전달하고 anonymous를 유지한다', async () => {
    const networkError = new TypeError('Failed to fetch');
    stubFetch((requestUrl) => (requestUrl === '/api/auth/me' ? meUnauthorized() : Promise.reject(networkError)));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let error: unknown;
    await act(async () => {
      error = await run(result.current, 'user@example.com', 'password123').catch((cause: unknown) => cause);
    });

    expect(error).toBe(networkError);
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' });
  });
});

describe('古い認証作業の結果(世代が変わらない場合)', () => {
  // 状態の反映で世代が切り替わらない場面では、作業番号だけが古い結果を止める。

  async function renderWithTwoRetries() {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const meResponses: (Response | Promise<Response>)[] = [
      jsonResponse(500, { message: '서버 오류' }),
      first.promise,
      second.promise,
    ];
    stubFetch((url) => (url === '/api/auth/me' ? meResponses.shift()! : jsonResponse(201, {})));
    const rendered = renderAuth();
    await waitFor(() => expect(rendered.result.current.state.status).toBe('error'));

    act(() => {
      rendered.result.current.retry();
    });
    act(() => {
      rendered.result.current.retry();
    });
    return { ...rendered, first, second };
  }

  test('새 작업이 진행 중일 때 오래된 작업이 실패해도 상태를 바꾸지 않는다', async () => {
    const { result, first, second } = await renderWithTwoRetries();

    await act(async () => {
      first.resolve(jsonResponse(500, { message: '서버 오류' }));
      await first.promise;
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    second.resolve(jsonResponse(200, user(2)));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('새 작업이 실패한 뒤 도착한 오래된 작업의 성공은 상태를 덮어쓰지 않는다', async () => {
    const { result, first, second } = await renderWithTwoRetries();

    second.resolve(jsonResponse(500, { message: '서버 오류' }));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
    await act(async () => {
      first.resolve(jsonResponse(200, user(1)));
      await first.promise;
    });

    expect(result.current.state).toEqual({ status: 'error' });
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });
});

describe('古い認証作業の結果', () => {
  test.each([
    { name: '성공', staleResponse: () => jsonResponse(200, user(1)) },
    { name: '실패', staleResponse: () => jsonResponse(500, { message: '서버 오류' }) },
  ])('오래된 작업의 결과($name)는 새 작업의 결과를 덮어쓰지 않는다', async ({ staleResponse }) => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const meResponses: (Response | Promise<Response>)[] = [
      jsonResponse(500, { message: '서버 오류' }),
      first.promise,
      second.promise,
    ];
    stubFetch((url) => (url === '/api/auth/me' ? meResponses.shift()! : jsonResponse(201, {})));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    // 再試行を2回押し、後の確認が先に完了した状況。
    act(() => {
      result.current.retry();
    });
    act(() => {
      result.current.retry();
    });
    second.resolve(jsonResponse(200, user(2)));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));

    await act(async () => {
      first.resolve(staleResponse());
      await first.promise;
    });

    expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('2');
  });
});

describe('ログアウト', () => {
  // ユーザー1でログインした状態から始める。/meの応答は各テストで決める。
  async function renderLoggedIn(handler: (url: string, init?: RequestInit, meCall?: number) => Promise<Response> | Response) {
    let meCall = 0;
    stubFetch((url, init) => {
      if (url === '/api/auth/me') {
        meCall += 1;
        if (meCall === 1) return jsonResponse(200, user(1));
      }
      return handler(url, init, meCall);
    });
    const rendered = renderAuth();
    await waitFor(() => expect(rendered.result.current.state).toEqual({ status: 'authenticated', user: user(1) }));
    return rendered;
  }

  async function logoutOf(result: { current: AuthContextValue }): Promise<unknown> {
    let error: unknown;
    await act(async () => {
      error = await result.current.logout().catch((cause: unknown) => cause);
    });
    return error;
  }

  test('성공하면 /me로 확인(토큰 재발급)한 뒤 loggedOut이 되고, 이후 요청에 예상 사용자 헤더가 붙지 않는다', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : meUnauthorized()
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/logout', '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('4xx로 거절되면 로그인 상태를 유지하고 오류를 전달하며, /me로 상태를 확인하지 않는다', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? jsonResponse(400, { message: '요청이 올바르지 않습니다.' }) : jsonResponse(201, {})
    ));

    const error = await logoutOf(result);

    expect(error).toBeInstanceOf(ApiError);
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/logout']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('1');
  });

  test.each([
    { name: '500', logoutResponse: () => jsonResponse(500, { message: '서버 오류' }) },
    { name: '응답 없음', logoutResponse: () => Promise.reject(new TypeError('Failed to fetch')) },
  ])('$name: /me가 로그인 안 됨이면 로그아웃을 확정한다', async ({ logoutResponse }) => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? logoutResponse() : meUnauthorized()
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });

  test('응답이 없고 /me가 원래 사용자면 로그인 상태를 유지하고 오류를 전달한다', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? Promise.reject(new TypeError('Failed to fetch')) : jsonResponse(200, user(1))
    ));

    const error = await logoutOf(result);

    expect(error).toBeInstanceOf(Error);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('1');
  });

  test('응답이 없고 /me가 다른 사용자면 그 사용자로 맞춘다(이전 사용자의 화면을 유지하지 않음)', async () => {
    const { result } = await renderLoggedIn((url) => {
      if (url === '/api/auth/logout') return Promise.reject(new TypeError('Failed to fetch'));
      if (url === '/api/auth/me') return jsonResponse(200, user(2));
      return jsonResponse(201, {});
    });

    await logoutOf(result);

    expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('2');
  });

  test('204를 받은 뒤 /me 확인에 실패해도 로그아웃을 확정한다', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : Promise.reject(new TypeError('Failed to fetch'))
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });

  test('응답이 없고 /me 확인도 실패하면 로그인 상태를 유지하고 오류를 전달한다', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' || url === '/api/auth/me'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : jsonResponse(201, {})
    ));

    const error = await logoutOf(result);

    expect(error).toBeInstanceOf(Error);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('1');
  });

  test('204를 받은 시점에 진행 중이던 이전 요청은 /me 확인을 기다리지 않고 취소된다', async () => {
    const me = deferred<Response>();
    const { result } = await renderLoggedIn((url, init) => {
      if (url === '/api/auth/logout') return new Response(null, { status: 204 });
      if (url === '/api/auth/me') return me.promise;
      return pendingUntilAborted(init);
    });

    const previousRequest = apiFetch('/api/job-postings').catch((error: unknown) => error);
    let done!: Promise<void>;
    act(() => {
      done = result.current.logout();
    });

    // サーバーがセッションを終えた時点で中断され、その401がセッション切れとして扱われない。
    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);
    expect(result.current.state.status).toBe('authenticated');

    await act(async () => {
      me.resolve(meUnauthorized());
      await done;
    });
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });

  test('로그아웃 응답 전에 다른 요청의 401이 와도 만료가 아니라 loggedOut으로 처리한다', async () => {
    const logoutResponse = deferred<Response>();
    const { result } = await renderLoggedIn((url) => {
      if (url === '/api/auth/logout') return logoutResponse.promise;
      return meUnauthorized();
    });

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.logout().catch((error: unknown) => error);
    });
    // サーバーではログアウトが先に処理され、別のリクエストの401が先に届いた場合。
    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    await act(async () => {
      logoutResponse.resolve(new Response(null, { status: 204 }));
    });
    await expect(done).resolves.toBeInstanceOf(AuthContextChangedError);
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });
});

describe('セッション切れ(保護APIの401)', () => {
  test('401이 여러 개 와도 재확인은 한 번만 일어나고, 나머지 요청은 AuthContextChangedError가 된다', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    // 起動時はログイン済み、再確認ではセッションが切れている。
    const meResponses = [jsonResponse(200, user(1)), meUnauthorized()];
    stubFetch((url) => {
      if (url === '/api/auth/me') return meResponses.shift() ?? meUnauthorized();
      return url === '/api/job-postings' ? first.promise : second.promise;
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));

    const firstRequest = apiFetch('/api/job-postings');
    const secondRequest = apiFetch('/api/job-postings/status-summary');
    await act(async () => {
      first.resolve(meUnauthorized());
      second.resolve(meUnauthorized());
      await firstRequest;
      await secondRequest.catch(() => undefined);
    });

    await expect(firstRequest).resolves.toHaveProperty('status', 401);
    await expect(secondRequest).rejects.toBeInstanceOf(AuthContextChangedError);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' }));
    expect(fetchedUrls().filter((url) => url === '/api/auth/me')).toHaveLength(2);
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('Provider가 해제된 뒤 도착한 /me 결과는 apiClient의 인증 상태를 바꾸지 않는다', async () => {
    const me = deferred<Response>();
    stubFetch((url) => (url === '/api/auth/me' ? me.promise : jsonResponse(201, {})));
    const { unmount } = renderAuth();
    unmount();

    await act(async () => {
      me.resolve(jsonResponse(200, user(4)));
      await me.promise;
    });

    // 反映されていれば、変更リクエストにユーザー4のIDが付く。
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('Provider가 해제되면 401 핸들러도 해제된다', async () => {
    // ログアウト状態の401は無視されるため、ログイン状態で確認する。
    stubFetch(() => jsonResponse(200, user(1)));
    const { result, unmount } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
    unmount();

    const pending = deferred<Response>();
    stubFetch((url) => (url === '/api/job-postings' ? pending.promise : meUnauthorized()));
    const pendingRequest = apiFetch('/api/job-postings');
    await apiFetch('/api/job-postings/status-summary');
    pending.resolve(jsonResponse(200, []));

    // ハンドラーが残っていると、401で認証状態が切り替わり、このリクエストが中断扱いになる。
    await expect(pendingRequest).resolves.toHaveProperty('status', 200);
  });
});

describe('他のタブとの同期と再確認', () => {
  const AUTH_CHANGED_KEY = 'joblens.auth-changed';

  // 他のタブがログイン・ログアウトしたときに届くstorageイベントを再現する。
  function signalFromOtherTab() {
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: AUTH_CHANGED_KEY,
        newValue: `other-tab-${Math.random()}`,
        storageArea: localStorage,
      }));
    });
  }

  // 起動時はユーザー1でログイン済み。2回目以降の/meの応答は引数で決める。
  async function renderLoggedInThen(nextMe: () => Response | Promise<Response>) {
    let meCall = 0;
    stubFetch((url) => {
      if (url === '/api/auth/me') {
        meCall += 1;
        return meCall === 1 ? jsonResponse(200, user(1)) : nextMe();
      }
      return jsonResponse(201, {});
    });
    const rendered = renderAuth();
    await waitFor(() => expect(rendered.result.current.state).toEqual({ status: 'authenticated', user: user(1) }));
    return rendered;
  }

  function meCalls(): number {
    return fetchedUrls().filter((url) => url === '/api/auth/me').length;
  }

  afterEach(() => {
    localStorage.clear();
  });

  test('다른 탭에서 로그아웃하면 확인 중을 거쳐 loggedOutElsewhere가 되고, 이전 요청은 취소된다', async () => {
    const me = deferred<Response>();
    const { result } = await renderLoggedInThen(() => me.promise);
    // 通知の時点でまだ応答が届いていない、前のユーザーのリクエスト。
    stubFetch((url, init) => (url === '/api/auth/me' ? me.promise : pendingUntilAborted(init)));
    const previousRequest = apiFetch('/api/job-postings/status-summary')
      .catch((error: unknown) => error);

    signalFromOtherTab();

    // 確認中は保護画面を隠す(RequireAuthが確認中の表示をする)。
    expect(result.current.state).toEqual({ status: 'loading' });
    // 確認の結果を待たずに、前のユーザーのリクエストは中断されている。
    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);
    await act(async () => {
      me.resolve(meUnauthorized());
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOutElsewhere' }));
    stubFetch(() => jsonResponse(201, {}));
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test.each([
    { name: '다른 사용자 B로 로그인', meUser: 2 },
    { name: '같은 사용자 A로 다시 로그인', meUser: 1 },
  ])('다른 탭에서의 변경($name): 그 사용자로 맞춘다', async ({ meUser }) => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(meUser)));

    signalFromOtherTab();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(meUser) }));
    await expect(expectedUserOfNextMutation()).resolves.toBe(String(meUser));
  });

  test('알림을 받았는데 /me 확인에 실패하면 error가 된다', async () => {
    const { result } = await renderLoggedInThen(() => Promise.reject(new TypeError('Failed to fetch')));

    signalFromOtherTab();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('401을 받으면 바로 만료 처리하지 않고, /me가 다른 사용자면 그 사용자로 맞춘다', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    stubFetch((url) => (url === '/api/auth/me' ? jsonResponse(200, user(2)) : meUnauthorized()));

    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('401을 받고 /me도 로그인 안 됨이면 expired가 된다', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch(() => meUnauthorized());

    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' }));
  });

  test('변경 요청이 서버에서 409 AUTH_CONTEXT_CHANGED를 받으면 /me로 확인해 실제 사용자로 맞춘다', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    stubFetch((url) => (url === '/api/auth/me'
      ? jsonResponse(200, user(2))
      : jsonResponse(409, { code: 'AUTH_CONTEXT_CHANGED', message: '다른 탭에서 로그인 계정이 바뀌었습니다.' })));

    await act(async () => {
      await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('재확인 중에 다시 알림이 오면, 나중 확인의 결과를 따른다', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const responses = [first.promise, second.promise];
    const { result } = await renderLoggedInThen(() => responses.shift()!);

    signalFromOtherTab();
    signalFromOtherTab();
    await act(async () => {
      second.resolve(jsonResponse(200, user(2)));
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
    await act(async () => {
      first.resolve(jsonResponse(200, user(3)));
    });

    expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) });
  });

  // retryは世代を切り替えないため、古い再確認の結果を止めるのは作業番号だけになる。
  test('재확인 뒤에 재시도가 시작되면, 늦게 도착한 재확인 결과는 반영하지 않는다', async () => {
    const recheckMe = deferred<Response>();
    const retryMe = deferred<Response>();
    const responses = [recheckMe.promise, retryMe.promise];
    const { result } = await renderLoggedInThen(() => responses.shift()!);

    signalFromOtherTab();
    act(() => {
      result.current.retry();
    });
    // 古い再確認の応答が先に届く(同じ世代なので、apiClientでは捨てられない)。
    await act(async () => {
      recheckMe.resolve(jsonResponse(200, user(3)));
      await recheckMe.promise;
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      retryMe.resolve(jsonResponse(200, user(2)));
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('재확인의 결과로는 다른 탭에 알림을 보내지 않는다(탭끼리 반복해서 알리지 않음)', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    localStorage.setItem(AUTH_CHANGED_KEY, 'from-other-tab');

    signalFromOtherTab();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));

    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBe('from-other-tab');
  });

  test.each([
    { name: '로그인', url: '/api/auth/login', run: (auth: AuthContextValue) => auth.login('u@example.com', 'password123'), ok: () => jsonResponse(200, user(5)) },
    { name: '회원가입', url: '/api/auth/signup', run: (auth: AuthContextValue) => auth.signup('u@example.com', 'password123'), ok: () => jsonResponse(201, user(5)) },
  ])('이 탭에서의 $name: 성공하면 다른 탭에 알리고, 서버가 거절하면 알리지 않는다', async ({ url, run, ok }) => {
    const responses = [jsonResponse(400, { message: '입력값이 올바르지 않습니다.' }), ok()];
    stubFetch((requestUrl) => (requestUrl === url ? responses.shift()! : meUnauthorized()));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    await act(async () => {
      await run(result.current).catch(() => undefined);
    });
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBeNull();

    await act(async () => {
      await run(result.current);
    });
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBeTruthy();
  });

  test('이 탭에서 로그아웃을 확정하면 다른 탭에 알린다', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch((url) => (url === '/api/auth/logout' ? new Response(null, { status: 204 }) : meUnauthorized()));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBeTruthy();
  });

  test('로그아웃 응답 전에 다른 요청의 401로 loggedOut이 되어도 다른 탭에 알린다', async () => {
    const logoutResponse = deferred<Response>();
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch((url) => (url === '/api/auth/logout' ? logoutResponse.promise : meUnauthorized()));

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.logout().catch((error: unknown) => error);
    });
    // サーバーではログアウトが先に処理され、別のリクエストの401が先に届いた場合。
    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBeTruthy();

    // ログアウトの応答は、より新しい作業(401による確定)に置き換えられて終わる。
    await act(async () => {
      logoutResponse.resolve(new Response(null, { status: 204 }));
    });
    await expect(done).resolves.toBeInstanceOf(AuthContextChangedError);
  });

  test('로그인하지 않은 상태에서 온 401은 상태를 바꾸지 않고 재확인도 하지 않는다', async () => {
    stubFetch(() => meUnauthorized());
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' }));
    const callsBefore = meCalls();

    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    // 「セッション切れ」の案内に変わらない。
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' });
    expect(meCalls()).toBe(callsBefore);
  });

  test('로그아웃에 실패한 뒤의 진짜 세션 만료는 loggedOut이 아니라 expired로 처리한다', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch((url) => (url === '/api/auth/logout'
      ? jsonResponse(400, { message: '요청이 올바르지 않습니다.' })
      : meUnauthorized()));
    await act(async () => {
      await result.current.logout().catch(() => undefined);
    });
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });

    // しばらく後に、本当にセッションが切れた。
    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' }));
  });

  test('이 탭에서 로그인하는 중에 다른 탭의 알림이 오면, 로그인은 AuthContextChangedError로 끝나고 상태는 확인 결과를 따른다', async () => {
    const loginResponse = deferred<Response>();
    let meCall = 0;
    stubFetch((url) => {
      if (url === '/api/auth/login') return loginResponse.promise;
      meCall += 1;
      return meCall === 1 ? meUnauthorized() : jsonResponse(200, user(2));
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.login('user1@example.com', 'password123').catch((error: unknown) => error);
    });
    signalFromOtherTab();
    await act(async () => {
      loginResponse.resolve(jsonResponse(200, user(1)));
    });

    await expect(done).resolves.toBeInstanceOf(AuthContextChangedError);
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('Provider가 해제되면 다른 탭의 알림과 409 알림을 더 이상 받지 않는다', async () => {
    const { unmount } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    unmount();

    stubFetch(() => jsonResponse(409, { code: 'AUTH_CONTEXT_CHANGED' }));
    signalFromOtherTab();
    await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    // 解除後に再確認(/me)が始まっていない。
    expect(meCalls()).toBe(0);
  });
});
