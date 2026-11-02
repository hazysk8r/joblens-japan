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
const meUnauthorized = () => jsonResponse(401, { code: 'UNAUTHORIZED', message: 'ログインが必要です。' });

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
  test('/meがユーザーを返すとauthenticatedになり、以降の変更リクエストにそのユーザーIDが付く', async () => {
    stubFetch((url) => (url === '/api/auth/me' ? jsonResponse(200, user(7)) : jsonResponse(201, {})));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(7) }));
    await expect(expectedUserOfNextMutation()).resolves.toBe('7');
  });

  test('/meが401なら期限切れではなくanonymousになり、変更リクエストに想定ユーザーのヘッダーが付かない', async () => {
    stubFetch((url) => (url === '/api/auth/me' ? meUnauthorized() : jsonResponse(201, {})));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'initial' }));
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('/meが500ならanonymousではなくerrorになり、retry後に成功するとauthenticatedになる', async () => {
    const responses = [jsonResponse(500, { message: 'サーバーエラー' }), jsonResponse(200, user(7))];
    stubFetch(() => responses.shift()!);

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(7) }));
  });

  test('/meがオフラインで失敗するとerrorになる', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('/meが終わる前はloadingで、/me以外のリクエストは送らない', async () => {
    const me = deferred<Response>();
    stubFetch(() => me.promise);

    const { result } = renderAuth();

    expect(result.current.state).toEqual({ status: 'loading' });
    me.resolve(jsonResponse(200, user(7)));
    await waitFor(() => expect(result.current.state.status).toBe('authenticated'));
    expect(fetchedUrls().every((url) => url === '/api/auth/me')).toBe(true);
  });

  test('StrictModeでも最終的なユーザーと想定ユーザーのヘッダーが一致する', async () => {
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
    certainFailure: () => jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'メールアドレスまたはパスワードが正しくありません。' }),
    certainFailureCode: 'INVALID_CREDENTIALS',
  },
  {
    name: '会員登録',
    url: '/api/auth/signup',
    run: (auth, email, password) => auth.signup(email, password),
    successResponse: (id) => jsonResponse(201, user(id)),
    certainFailure: () => jsonResponse(409, { code: 'EMAIL_ALREADY_EXISTS', message: 'このメールアドレスはすでに登録されています。' }),
    certainFailureCode: 'EMAIL_ALREADY_EXISTS',
  },
];

describe.each(authOperations)('$name', ({ url, run, successResponse, certainFailure, certainFailureCode }) => {
  test('開始すると進行中のリクエストが取り消され、成功後の変更リクエストには新しいユーザーIDが付く', async () => {
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

  test('以前のリクエストは応答を待たず、開始した時点で取り消される', async () => {
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
  test('進行中(ログイン前の状態)に別のリクエストの401が来ても無視し、認証の結果にそのまま従う', async () => {
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

  test('サーバーが失敗を返すとanonymousを維持してエラーを伝え、/meの確認と期限切れの処理はしない', async () => {
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
  test.each([500, 502, 504])('サーバーが%iを返すと再送せず、/meで確認して状態を決める', async (status) => {
    const meResponses = [meUnauthorized(), jsonResponse(200, user(6))];
    stubFetch((requestUrl) => (requestUrl === '/api/auth/me'
      ? meResponses.shift()!
      : jsonResponse(status, { message: 'サーバーエラー' })));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    await act(async () => {
      await run(result.current, 'user6@example.com', 'password123');
    });

    expect(fetchedUrls()).toEqual(['/api/auth/me', url, '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(6) });
  });

  test('CSRFトークンを受け取れずリクエストを送らなかった場合は、/meの確認なしでエラーを伝える', async () => {
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

  test('応答を受け取れないとリクエストを再送せず、/meで確認して状態を決める', async () => {
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

  test('応答を受け取れず/meもログイン前なら、元のエラーを伝えてanonymousを維持する', async () => {
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
      jsonResponse(500, { message: 'サーバーエラー' }),
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

  test('新しい処理の進行中に古い処理が失敗しても状態を変えない', async () => {
    const { result, first, second } = await renderWithTwoRetries();

    await act(async () => {
      first.resolve(jsonResponse(500, { message: 'サーバーエラー' }));
      await first.promise;
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    second.resolve(jsonResponse(200, user(2)));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('新しい処理の失敗後に届いた古い処理の成功は状態を上書きしない', async () => {
    const { result, first, second } = await renderWithTwoRetries();

    second.resolve(jsonResponse(500, { message: 'サーバーエラー' }));
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
    { name: '成功', staleResponse: () => jsonResponse(200, user(1)) },
    { name: '失敗', staleResponse: () => jsonResponse(500, { message: 'サーバーエラー' }) },
  ])('古い処理の結果($name)は新しい処理の結果を上書きしない', async ({ staleResponse }) => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const meResponses: (Response | Promise<Response>)[] = [
      jsonResponse(500, { message: 'サーバーエラー' }),
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

  test('成功すると/meで確認(トークン再発行)してからloggedOutになり、以降のリクエストに想定ユーザーのヘッダーが付かない', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : meUnauthorized()
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/logout', '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    await expect(expectedUserOfNextMutation()).resolves.toBeUndefined();
  });

  test('4xxで拒否されるとログイン状態を維持してエラーを伝え、/meで状態を確認しない', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? jsonResponse(400, { message: 'リクエストが正しくありません。' }) : jsonResponse(201, {})
    ));

    const error = await logoutOf(result);

    expect(error).toBeInstanceOf(ApiError);
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/logout']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('1');
  });

  test.each([
    { name: '500', logoutResponse: () => jsonResponse(500, { message: 'サーバーエラー' }) },
    { name: '応答なし', logoutResponse: () => Promise.reject(new TypeError('Failed to fetch')) },
  ])('$name: /meが未ログインならログアウトを確定する', async ({ logoutResponse }) => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? logoutResponse() : meUnauthorized()
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });

  test('応答がなく/meが元のユーザーなら、ログイン状態を維持してエラーを伝える', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? Promise.reject(new TypeError('Failed to fetch')) : jsonResponse(200, user(1))
    ));

    const error = await logoutOf(result);

    expect(error).toBeInstanceOf(Error);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(1) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('1');
  });

  test('応答がなく/meが別のユーザーなら、そのユーザーに合わせる(以前のユーザーの画面を維持しない)', async () => {
    const { result } = await renderLoggedIn((url) => {
      if (url === '/api/auth/logout') return Promise.reject(new TypeError('Failed to fetch'));
      if (url === '/api/auth/me') return jsonResponse(200, user(2));
      return jsonResponse(201, {});
    });

    await logoutOf(result);

    expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('2');
  });

  test('204を受け取った後に/meの確認に失敗してもログアウトを確定する', async () => {
    const { result } = await renderLoggedIn((url) => (
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : Promise.reject(new TypeError('Failed to fetch'))
    ));

    const error = await logoutOf(result);

    expect(error).toBeUndefined();
    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
  });

  test('応答がなく/meの確認も失敗すると、ログイン状態を維持してエラーを伝える', async () => {
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

  test('204を受け取った時点で進行中の以前のリクエストは、/meの確認を待たず取り消される', async () => {
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

  test('ログアウトの応答前に別のリクエストの401が来ても、期限切れではなくloggedOutとして処理する', async () => {
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
  test('401が複数来ても再確認は一度だけで、残りのリクエストはAuthContextChangedErrorになる', async () => {
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

  test('Providerの解除後に届いた/meの結果はapiClientの認証状態を変えない', async () => {
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

  test('Providerが解除されると401ハンドラーも解除される', async () => {
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

  test('別のタブでログアウトすると確認中を経てloggedOutElsewhereになり、以前のリクエストは取り消される', async () => {
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
    { name: '別のユーザーBでログイン', meUser: 2 },
    { name: '同じユーザーAで再ログイン', meUser: 1 },
  ])('別のタブでの変更($name): そのユーザーに合わせる', async ({ meUser }) => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(meUser)));

    signalFromOtherTab();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(meUser) }));
    await expect(expectedUserOfNextMutation()).resolves.toBe(String(meUser));
  });

  test('通知を受けて/meの確認に失敗するとerrorになる', async () => {
    const { result } = await renderLoggedInThen(() => Promise.reject(new TypeError('Failed to fetch')));

    signalFromOtherTab();

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  test('401を受けてもすぐ期限切れにせず、/meが別のユーザーならそのユーザーに合わせる', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    stubFetch((url) => (url === '/api/auth/me' ? jsonResponse(200, user(2)) : meUnauthorized()));

    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('401を受けて/meも未ログインならexpiredになる', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch(() => meUnauthorized());

    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', reason: 'expired' }));
  });

  test('変更リクエストがサーバーから409 AUTH_CONTEXT_CHANGEDを受けると、/meで確認して実際のユーザーに合わせる', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    stubFetch((url) => (url === '/api/auth/me'
      ? jsonResponse(200, user(2))
      : jsonResponse(409, { code: 'AUTH_CONTEXT_CHANGED', message: '別のタブでログインアカウントが変更されました。' })));

    await act(async () => {
      await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));
  });

  test('再確認中にまた通知が来たら、後の確認の結果に従う', async () => {
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
  test('再確認の後に再試行が始まったら、遅れて届いた再確認の結果は反映しない', async () => {
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

  test('再確認の結果では別のタブに通知しない(タブ同士で繰り返し通知しない)', async () => {
    const { result } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    localStorage.setItem(AUTH_CHANGED_KEY, 'from-other-tab');

    signalFromOtherTab();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'authenticated', user: user(2) }));

    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBe('from-other-tab');
  });

  test.each([
    { name: 'ログイン', url: '/api/auth/login', run: (auth: AuthContextValue) => auth.login('u@example.com', 'password123'), ok: () => jsonResponse(200, user(5)) },
    { name: '会員登録', url: '/api/auth/signup', run: (auth: AuthContextValue) => auth.signup('u@example.com', 'password123'), ok: () => jsonResponse(201, user(5)) },
  ])('このタブでの$name: 成功すると別のタブに通知し、サーバーが拒否すると通知しない', async ({ url, run, ok }) => {
    const responses = [jsonResponse(400, { message: '入力値が正しくありません。' }), ok()];
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

  test('このタブでログアウトを確定すると別のタブに通知する', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch((url) => (url === '/api/auth/logout' ? new Response(null, { status: 204 }) : meUnauthorized()));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.state).toEqual({ status: 'anonymous', reason: 'loggedOut' });
    expect(localStorage.getItem(AUTH_CHANGED_KEY)).toBeTruthy();
  });

  test('ログアウトの応答前に別のリクエストの401でloggedOutになっても別のタブに通知する', async () => {
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

  test('未ログインの状態で来た401は状態を変えず、再確認もしない', async () => {
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

  test('ログアウト失敗後の本当のセッション切れはloggedOutではなくexpiredとして処理する', async () => {
    const { result } = await renderLoggedInThen(() => meUnauthorized());
    stubFetch((url) => (url === '/api/auth/logout'
      ? jsonResponse(400, { message: 'リクエストが正しくありません。' })
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

  test('このタブでログイン中に別のタブの通知が来ると、ログインはAuthContextChangedErrorで終わり、状態は確認の結果に従う', async () => {
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

  test('Providerが解除されると別のタブの通知と409の通知をこれ以上受けない', async () => {
    const { unmount } = await renderLoggedInThen(() => jsonResponse(200, user(2)));
    unmount();

    stubFetch(() => jsonResponse(409, { code: 'AUTH_CONTEXT_CHANGED' }));
    signalFromOtherTab();
    await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    // 解除後に再確認(/me)が始まっていない。
    expect(meCalls()).toBe(0);
  });
});
