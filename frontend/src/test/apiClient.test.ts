import {
  AuthContextChangedError,
  CsrfTokenUnavailableError,
  apiFetch,
  setAuthContextMismatchHandler,
  setUnauthorizedHandler,
  switchAuthContext,
} from '../api/apiClient';
import {
  createJobPosting,
  deleteJobPosting,
  fetchJobPostingAnalysis,
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateApplicationStatus,
  updateJobPosting,
} from '../api/jobPostingApi';
import {
  createJobPostingMemo,
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';

import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

const CSRF_HEADER = 'X-XSRF-TOKEN';

function setCsrfCookie(token: string) {
  document.cookie = `XSRF-TOKEN=${token}; path=/`;
}

function clearCsrfCookie() {
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// fetchのn回目の呼び出しで送られたヘッダーを取り出す。
function headersOfCall(index: number): Record<string, string> | undefined {
  const init = vi.mocked(fetch).mock.calls[index][1];
  return init?.headers as Record<string, string> | undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearCsrfCookie();
  // 他のテストにログイン中のユーザーを残さない。
  switchAuthContext(null);
});

describe('CSRFトークンのヘッダー', () => {
  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%sリクエストにはCookieのCSRFトークンをヘッダーに入れる',
    async (method) => {
      setCsrfCookie('token-1');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

      await apiFetch('/api/job-postings/1', { method });

      expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('token-1');
    },
  );

  test('GETリクエストにはCSRFトークンを入れない', async () => {
    setCsrfCookie('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));

    await apiFetch('/api/job-postings');

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBeUndefined();
  });

  test('トークンのCookieが変わると次のリクエストは新しいトークンを使う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    setCsrfCookie('before-login');
    await apiFetch('/api/job-postings/1', { method: 'DELETE' });
    // ログインでトークンが再発行された状況を再現する。
    setCsrfCookie('after-login');
    await apiFetch('/api/job-postings/1', { method: 'DELETE' });

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('before-login');
    expect(headersOfCall(1)?.[CSRF_HEADER]).toBe('after-login');
  });

  test('既存のヘッダーを維持しながらCSRFトークンを追加する', async () => {
    setCsrfCookie('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));

    await apiFetch('/api/job-postings/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"3"' },
      body: '{}',
    });

    expect(headersOfCall(0)).toEqual({
      'Content-Type': 'application/json',
      'If-Match': '"3"',
      [CSRF_HEADER]: 'token-1',
    });
  });

  // ログアウト直後などトークンのCookieがない場合は、トークンなしで送らずに先に取得する。
  test('トークンのCookieがなければ先にトークンを受け取り、新しいトークンで送る', async () => {
    clearCsrfCookie();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        // サーバーがCookieを発行したことを再現する。
        setCsrfCookie('issued');
        return jsonResponse(401, { code: 'UNAUTHORIZED' });
      }
      return new Response(null, { status: 204 });
    }));

    await apiFetch('/api/job-postings/1', { method: 'DELETE' });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', '/api/job-postings/1']);
    expect(headersOfCall(1)?.[CSRF_HEADER]).toBe('issued');
  });

  test.each([
    { name: 'トークンが発行されない', me: async () => jsonResponse(401, { code: 'UNAUTHORIZED' }) },
    { name: 'トークンのリクエストが失敗', me: async () => { throw new TypeError('Failed to fetch'); } },
  ])('トークンのCookieがなく受け取ることもできないと($name)、リクエストを送らずCsrfTokenUnavailableErrorを投げる', async ({ me }) => {
    clearCsrfCookie();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => (
      url === '/api/auth/me' ? me() : new Response(null, { status: 204 })
    )));

    await expect(apiFetch('/api/auth/login', { method: 'POST', body: '{}' }))
      .rejects.toBeInstanceOf(CsrfTokenUnavailableError);
    // 資格情報などを、トークンなしで送らない。
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/auth/me']);
  });

  test('取得リクエストはトークンのCookieがなくても先にトークンを受け取らない', async () => {
    clearCsrfCookie();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));

    await apiFetch('/api/job-postings');

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/job-postings']);
  });

  const jobPostingRequest = {
    companyName: null,
    title: 'Engineer',
    sourceUrl: null,
    originalText: 'Java',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
  };

  // 状態を変更するすべてのAPI関数が、fetchを直接呼ばずにapiFetchを通ることを確認する。
  const stateChangingApis = [
    { name: '求人の登録', run: () => createJobPosting(jobPostingRequest) },
    { name: '求人の編集', run: () => updateJobPosting(1, jobPostingRequest, 3) },
    { name: '求人の削除', run: () => deleteJobPosting(1) },
    { name: '応募ステータスの変更', run: () => updateApplicationStatus(1, { status: 'APPLIED' }, 3) },
    { name: 'メモ登録', run: () => createJobPostingMemo(1, { content: 'memo' }) },
    { name: 'メモを編集', run: () => updateJobPostingMemo(1, 2, { content: 'memo' }) },
    { name: 'メモを削除', run: () => deleteJobPostingMemo(1, 2) },
  ];

  test.each(stateChangingApis)('$nameのAPIはCSRFトークンをヘッダーで送る', async ({ run }) => {
    setCsrfCookie('token-1');
    // 成功応答の本文は検証しないため、どのAPIでも読めるJSONを返す。
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await run();

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('token-1');
  });
});

describe('CSRFトークンが無効な場合', () => {
  test('403 CSRF_TOKEN_INVALIDならトークンだけ受け取り直し、元のリクエストは再送しない', async () => {
    setCsrfCookie('stale');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: 'CSRF_TOKEN_INVALID' }))
      .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })));

    const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    // 自動で再送すると、待機中に別のタブで切り替わったアカウントへ送られるおそれがある。
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/job-postings',
      '/api/auth/me',
    ]);
    expect(response.status).toBe(403);
    // 呼び出し元がエラー本文を読めるよう、本文は消費しない。
    await expect(response.json()).resolves.toEqual({ code: 'CSRF_TOKEN_INVALID' });
  });

  test('CSRF以外の403ではトークンを受け取り直さない', async () => {
    setCsrfCookie('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { code: 'FORBIDDEN' })));

    const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    expect(response.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('別のユーザーへの切り替わり(409 AUTH_CONTEXT_CHANGED)の通知', () => {
  // サーバーが「画面のユーザーとセッションのユーザーが違う」と判断した応答。
  const mismatch = () => jsonResponse(409, { code: 'AUTH_CONTEXT_CHANGED', message: '別のタブでログインアカウントが変更されました。' });

  test('409 AUTH_CONTEXT_CHANGEDなら登録されたハンドラーを呼び、応答はそのまま返す', async () => {
    const handler = vi.fn();
    const unregister = setAuthContextMismatchHandler(handler);
    switchAuthContext(1);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => mismatch()));

    try {
      const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

      expect(handler).toHaveBeenCalledTimes(1);
      await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_CONTEXT_CHANGED' });
    } finally {
      unregister();
    }
  });

  test('別の409(登録済みのメールアドレス)ではハンドラーを呼ばない', async () => {
    const handler = vi.fn();
    const unregister = setAuthContextMismatchHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { code: 'EMAIL_ALREADY_EXISTS' })));

    try {
      await apiFetch('/api/auth/signup', { method: 'POST', body: '{}' });

      expect(handler).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test('認証状態が変わった後に遅れて届いた409ではハンドラーを呼ばない', async () => {
    const handler = vi.fn();
    const unregister = setAuthContextMismatchHandler(handler);
    switchAuthContext(1);
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((done) => {
      respond = done;
    })));

    try {
      const request = apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
      switchAuthContext(2);
      respond(mismatch());

      await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});

describe('ログインが必要な応答(401)の通知', () => {
  test('notifyUnauthorizedがfalseのリクエストの401ではハンドラーを呼ばず、このオプションはfetchに渡さない', async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED' })));

    try {
      // ログイン状態の確認のように、401が想定内のリクエスト。
      const response = await apiFetch('/api/auth/me', { notifyUnauthorized: false });

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
      expect(vi.mocked(fetch).mock.calls[0][1]).not.toHaveProperty('notifyUnauthorized');
    } finally {
      unregister();
    }
  });

  test('401 UNAUTHORIZEDなら登録されたハンドラーを呼び、応答の本文はそのまま読める', async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { code: 'UNAUTHORIZED', message: 'ログインが必要です。' }),
    ));

    try {
      const response = await apiFetch('/api/job-postings');

      expect(handler).toHaveBeenCalledTimes(1);
      await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      unregister();
    }
  });

  test('ログイン失敗(401 INVALID_CREDENTIALS)ではハンドラーを呼ばない', async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { code: 'INVALID_CREDENTIALS' }),
    ));

    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: '{}' });

      expect(handler).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test('登録を解除したハンドラーは呼ばない', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler)();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED' })));

    await apiFetch('/api/job-postings');

    expect(handler).not.toHaveBeenCalled();
  });

  test('以前のハンドラーの解除が後から登録したハンドラーを消さない', async () => {
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    const unregisterOld = setUnauthorizedHandler(oldHandler);
    const unregisterNew = setUnauthorizedHandler(newHandler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED' })));

    try {
      // React StrictModeなどで、古い登録の後片付けが後から実行される状況。
      unregisterOld();
      await apiFetch('/api/job-postings');

      expect(oldHandler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalledTimes(1);
    } finally {
      unregisterNew();
    }
  });
});

describe('各API関数の401の通知', () => {
  // 照会のAPIも含め、すべてのAPI関数がapiFetchを通って401を通知することを確認する。
  const allApis = [
    {
      name: '求人一覧の取得',
      run: () => fetchJobPostings('', '', 0, 'createdAt,desc', null, null, null, null),
    },
    { name: '応募ステータス集計の取得', run: () => fetchApplicationStatusSummary() },
    { name: '応募ステータス履歴の取得', run: () => fetchApplicationStatusHistory(1, new AbortController().signal) },
    { name: '求人票の分析', run: () => fetchJobPostingAnalysis(1, new AbortController().signal) },
    { name: 'メモ一覧の取得', run: () => getJobPostingMemos(1, new AbortController().signal) },
    { name: 'メモ登録', run: () => createJobPostingMemo(1, { content: 'memo' }) },
  ];

  test.each(allApis)('$nameのAPIが401を受けるとハンドラーを呼び、エラーを投げる', async ({ run }) => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(
      async () => jsonResponse(401, { code: 'UNAUTHORIZED' }),
    ));

    try {
      await expect(run()).rejects.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});

describe('認証状態の変更とリクエスト', () => {
  const EXPECTED_USER_HEADER = 'X-Expected-User-Id';

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  // signalで中断されるまで応答しない、通信中のリクエストを再現する。
  function pendingUntilAborted(_url: string, init?: RequestInit): Promise<Response> {
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
  }

  test('ログイン中の状態変更リクエストには想定ユーザーのIDをヘッダーに入れる', async () => {
    switchAuthContext(7);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    await apiFetch('/api/job-postings');

    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBe('7');
    expect(headersOfCall(1)?.[EXPECTED_USER_HEADER]).toBeUndefined();
  });

  test('未ログインの状態では想定ユーザーのIDを入れない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await apiFetch('/api/auth/login', { method: 'POST', body: '{}' });

    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBeUndefined();
  });

  test('進行中のリクエストは認証状態が変わると取り消され、AuthContextChangedErrorを投げる', async () => {
    switchAuthContext(1);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(pendingUntilAborted));

    const request = apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    switchAuthContext(2);

    await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
  });

  test('認証状態が変わった後に失敗したリクエストはネットワークエラーの代わりにAuthContextChangedErrorを投げる', async () => {
    switchAuthContext(1);
    let failRequest!: (error: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((_, reject) => {
      failRequest = reject;
    })));

    const request = apiFetch('/api/job-postings');
    switchAuthContext(2);
    // 中断ではなく、通信エラーとして失敗した場合を再現する。
    failRequest(new TypeError('Failed to fetch'));

    await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
  });

  test('応答が届いたときに認証状態が変わっていれば応答を返さない', async () => {
    switchAuthContext(1);
    const response = deferred<Response>();
    // 中断に応じず、後から応答が届く場合を再現する。
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));

    const request = apiFetch('/api/job-postings');
    switchAuthContext(2);
    response.resolve(jsonResponse(200, { content: ['user1の求人'] }));

    await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
  });

  test('Bへ切り替えた後にAのときのリクエストの401が遅れて届いてもハンドラーを呼ばない', async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    switchAuthContext(1);
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));

    try {
      const request = apiFetch('/api/job-postings');
      switchAuthContext(2);
      response.resolve(jsonResponse(401, { code: 'UNAUTHORIZED' }));

      await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test('同じ認証状態で401が複数届いても、ハンドラーが認証状態を変えれば一度だけ呼ばれる', async () => {
    // 3-5のハンドラーと同じく、ログアウト状態に切り替える。
    const handler = vi.fn(() => switchAuthContext(null));
    const unregister = setUnauthorizedHandler(handler);
    switchAuthContext(1);
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise));

    try {
      const firstRequest = apiFetch('/api/job-postings');
      const secondRequest = apiFetch('/api/job-postings/status-summary');
      first.resolve(jsonResponse(401, { code: 'UNAUTHORIZED' }));
      second.resolve(jsonResponse(401, { code: 'UNAUTHORIZED' }));

      await expect(firstRequest).resolves.toHaveProperty('status', 401);
      await expect(secondRequest).rejects.toBeInstanceOf(AuthContextChangedError);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  test('呼び出し側が取り消したリクエストは従来どおりAbortErrorをそのまま伝える', async () => {
    switchAuthContext(1);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(pendingUntilAborted));
    const controller = new AbortController();

    const request = apiFetch('/api/job-postings/1/analysis', { signal: controller.signal });
    controller.abort();

    const error = await request.catch((cause: unknown) => cause);
    expect(error).not.toBeInstanceOf(AuthContextChangedError);
    expect(error).toHaveProperty('name', 'AbortError');
  });

  test('認証状態が変わった後に新しく送ったリクエストは正しく処理される', async () => {
    switchAuthContext(1);
    switchAuthContext(2);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    expect(response.status).toBe(200);
    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBe('2');
  });
});
