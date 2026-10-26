import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  AuthContextChangedError,
  apiFetch,
  switchAuthContext,
} from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/useAuth';

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

    await waitFor(() => expect(result.current.state).toEqual({ status: 'anonymous', sessionExpired: false }));
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

describe('ログイン', () => {
  test('로그인을 시작하면 진행 중이던 요청이 취소되고, 성공 후의 변경 요청에는 새 사용자 ID가 붙는다', async () => {
    stubFetch((url, init) => {
      if (url === '/api/auth/me') return meUnauthorized();
      if (url === '/api/auth/login') return jsonResponse(200, user(3));
      if (url === '/api/job-postings/status-summary') return pendingUntilAborted(init);
      return jsonResponse(201, {});
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    // ログイン前の状態で送り、まだ応答が届いていないリクエスト。
    // ログイン中に中断されるため、結果を先に受け取っておく(未処理の拒否にしない)。
    const previousRequest = apiFetch('/api/job-postings/status-summary')
      .catch((error: unknown) => error);
    await act(async () => {
      await result.current.login('user3@example.com', 'password123');
    });

    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(3) });
    await expect(expectedUserOfNextMutation()).resolves.toBe('3');
  });

  test('이전 요청은 로그인 응답을 기다리지 않고 로그인을 시작한 시점에 취소된다', async () => {
    const loginResponse = deferred<Response>();
    stubFetch((url, init) => {
      if (url === '/api/auth/me') return meUnauthorized();
      if (url === '/api/auth/login') return loginResponse.promise;
      return pendingUntilAborted(init);
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    const previousRequest = apiFetch('/api/job-postings/status-summary')
      .catch((error: unknown) => error);
    let loginDone!: Promise<void>;
    act(() => {
      loginDone = result.current.login('user3@example.com', 'password123');
    });

    // ログインの応答が届く前に、すでに中断されている。
    await expect(previousRequest).resolves.toBeInstanceOf(AuthContextChangedError);

    await act(async () => {
      loginResponse.resolve(jsonResponse(200, user(3)));
      await loginDone;
    });
  });

  test('로그인 중에 401로 만료 처리되면 로그인은 AuthContextChangedError로 끝나고 /me 확인을 하지 않는다', async () => {
    stubFetch((url, init) => {
      if (url === '/api/auth/me') return meUnauthorized();
      if (url === '/api/auth/login') return pendingUntilAborted(init);
      return meUnauthorized();
    });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let loginDone!: Promise<unknown>;
    act(() => {
      loginDone = result.current.login('user@example.com', 'password123')
        .catch((error: unknown) => error);
    });
    // ログイン開始後の同じ認証状態で送ったリクエストが401を受け、セッション切れとして処理される。
    await act(async () => {
      await apiFetch('/api/job-postings');
    });

    await expect(loginDone).resolves.toBeInstanceOf(AuthContextChangedError);
    // 応答のないログインとして扱われると、ログイン状態の確認(/me)が追加で送られる。
    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/login', '/api/job-postings']);
    expect(result.current.state).toEqual({ status: 'anonymous', sessionExpired: true });
  });

  test('비밀번호가 틀리면 anonymous를 유지하고 오류를 전달하며, 만료 처리는 하지 않는다', async () => {
    stubFetch((url) => (url === '/api/auth/me'
      ? meUnauthorized()
      : jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' })));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let error: unknown;
    await act(async () => {
      error = await result.current.login('user@example.com', 'wrong').catch((cause: unknown) => cause);
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(result.current.state).toEqual({ status: 'anonymous', sessionExpired: false });
  });

  test('로그인 응답을 받지 못하면 로그인 요청을 다시 보내지 않고 /me로 확인해 상태를 정한다', async () => {
    const meResponses = [meUnauthorized(), jsonResponse(200, user(5))];
    stubFetch((url) => (url === '/api/auth/me'
      ? meResponses.shift()!
      // サーバーではログインが完了したが、応答が届く前に通信が切れた場合。
      : Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    await act(async () => {
      await result.current.login('user5@example.com', 'password123');
    });

    expect(fetchedUrls()).toEqual(['/api/auth/me', '/api/auth/login', '/api/auth/me']);
    expect(result.current.state).toEqual({ status: 'authenticated', user: user(5) });
  });

  test('로그인 응답을 받지 못했고 /me도 로그인 전이면 원래 오류를 전달하고 anonymous를 유지한다', async () => {
    const networkError = new TypeError('Failed to fetch');
    stubFetch((url) => (url === '/api/auth/me' ? meUnauthorized() : Promise.reject(networkError)));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));

    let error: unknown;
    await act(async () => {
      error = await result.current.login('user@example.com', 'password123').catch((cause: unknown) => cause);
    });

    expect(error).toBe(networkError);
    expect(result.current.state).toEqual({ status: 'anonymous', sessionExpired: false });
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

describe('セッション切れ(保護APIの401)', () => {
  test('401이 여러 개 와도 만료 처리는 한 번만 일어나고, 나머지 요청은 AuthContextChangedError가 된다', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    stubFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, user(1));
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
    expect(result.current.state).toEqual({ status: 'anonymous', sessionExpired: true });
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
    stubFetch(() => meUnauthorized());
    const { result, unmount } = renderAuth();
    await waitFor(() => expect(result.current.state.status).toBe('anonymous'));
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
