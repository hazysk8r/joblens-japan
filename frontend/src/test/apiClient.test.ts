import {
  AuthContextChangedError,
  apiFetch,
  setUnauthorizedHandler,
  switchAuthContext,
} from '../api/apiClient';
import {
  createJobPosting,
  deleteJobPosting,
  extractRequiredSkills,
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
    '%s 요청에는 쿠키의 CSRF 토큰을 헤더로 넣는다',
    async (method) => {
      setCsrfCookie('token-1');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

      await apiFetch('/api/job-postings/1', { method });

      expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('token-1');
    },
  );

  test('GET 요청에는 CSRF 토큰을 넣지 않는다', async () => {
    setCsrfCookie('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [])));

    await apiFetch('/api/job-postings');

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBeUndefined();
  });

  test('토큰 쿠키가 바뀌면 다음 요청은 새 토큰을 사용한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    setCsrfCookie('before-login');
    await apiFetch('/api/job-postings/1', { method: 'DELETE' });
    // ログインでトークンが再発行された状況を再現する。
    setCsrfCookie('after-login');
    await apiFetch('/api/job-postings/1', { method: 'DELETE' });

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('before-login');
    expect(headersOfCall(1)?.[CSRF_HEADER]).toBe('after-login');
  });

  test('기존 헤더를 유지하면서 CSRF 토큰을 추가한다', async () => {
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

  test('토큰 쿠키가 없으면 헤더 없이 요청을 보낸다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await apiFetch('/api/job-postings/1', { method: 'DELETE' });

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBeUndefined();
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
    { name: '공고 등록', run: () => createJobPosting(jobPostingRequest) },
    { name: '공고 수정', run: () => updateJobPosting(1, jobPostingRequest, 3) },
    { name: '공고 삭제', run: () => deleteJobPosting(1) },
    { name: '지원 상태 변경', run: () => updateApplicationStatus(1, { status: 'APPLIED' }, 3) },
    { name: '메모 등록', run: () => createJobPostingMemo(1, { content: 'memo' }) },
    { name: '메모 수정', run: () => updateJobPostingMemo(1, 2, { content: 'memo' }) },
    { name: '메모 삭제', run: () => deleteJobPostingMemo(1, 2) },
  ];

  test.each(stateChangingApis)('$name API는 CSRF 토큰을 헤더로 보낸다', async ({ run }) => {
    setCsrfCookie('token-1');
    // 成功応答の本文は検証しないため、どのAPIでも読めるJSONを返す。
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await run();

    expect(headersOfCall(0)?.[CSRF_HEADER]).toBe('token-1');
  });
});

describe('CSRFトークンが無効な場合', () => {
  test('403 CSRF_TOKEN_INVALID이면 토큰만 새로 받고 원래 요청은 다시 보내지 않는다', async () => {
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

  test('CSRF 이외의 403은 토큰을 새로 받지 않는다', async () => {
    setCsrfCookie('token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { code: 'FORBIDDEN' })));

    const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    expect(response.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ログインが必要な応答(401)の通知', () => {
  test('401 UNAUTHORIZED이면 등록된 핸들러를 호출하고 응답 본문은 그대로 읽을 수 있다', async () => {
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }),
    ));

    try {
      const response = await apiFetch('/api/job-postings');

      expect(handler).toHaveBeenCalledTimes(1);
      await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      unregister();
    }
  });

  test('로그인 실패(401 INVALID_CREDENTIALS)는 핸들러를 호출하지 않는다', async () => {
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

  test('등록을 해제한 핸들러는 호출하지 않는다', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler)();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { code: 'UNAUTHORIZED' })));

    await apiFetch('/api/job-postings');

    expect(handler).not.toHaveBeenCalled();
  });

  test('이전 핸들러의 해제가 나중에 등록된 핸들러를 지우지 않는다', async () => {
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
      name: '공고 목록 조회',
      run: () => fetchJobPostings('', '', 0, 'createdAt,desc', null, null, null, null),
    },
    { name: '지원 상태 요약 조회', run: () => fetchApplicationStatusSummary() },
    { name: '지원 상태 이력 조회', run: () => fetchApplicationStatusHistory(1) },
    { name: '기술 스택 조회', run: () => extractRequiredSkills(1, new AbortController().signal) },
    { name: '메모 목록 조회', run: () => getJobPostingMemos(1) },
    { name: '메모 등록', run: () => createJobPostingMemo(1, { content: 'memo' }) },
  ];

  test.each(allApis)('$name API가 401을 받으면 핸들러를 호출하고 오류를 던진다', async ({ run }) => {
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

  test('로그인 상태의 상태 변경 요청에는 예상 사용자 ID를 헤더로 넣는다', async () => {
    switchAuthContext(7);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    await apiFetch('/api/job-postings');

    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBe('7');
    expect(headersOfCall(1)?.[EXPECTED_USER_HEADER]).toBeUndefined();
  });

  test('로그인하지 않은 상태에서는 예상 사용자 ID를 넣지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    await apiFetch('/api/auth/login', { method: 'POST', body: '{}' });

    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBeUndefined();
  });

  test('진행 중인 요청은 인증 상태가 바뀌면 취소되고 AuthContextChangedError를 던진다', async () => {
    switchAuthContext(1);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(pendingUntilAborted));

    const request = apiFetch('/api/job-postings', { method: 'POST', body: '{}' });
    switchAuthContext(2);

    await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
  });

  test('인증 상태가 바뀐 뒤 실패한 요청은 네트워크 오류 대신 AuthContextChangedError를 던진다', async () => {
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

  test('응답이 도착했을 때 인증 상태가 바뀌어 있으면 응답을 반환하지 않는다', async () => {
    switchAuthContext(1);
    const response = deferred<Response>();
    // 中断に応じず、後から応答が届く場合を再現する。
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));

    const request = apiFetch('/api/job-postings');
    switchAuthContext(2);
    response.resolve(jsonResponse(200, { content: ['user1의 공고'] }));

    await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
  });

  test('B로 전환한 뒤 A 때 보낸 요청의 401이 늦게 도착해도 핸들러를 호출하지 않는다', async () => {
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

  test('같은 인증 상태에서 401이 여러 번 도착해도 핸들러가 인증 상태를 바꾸면 한 번만 호출된다', async () => {
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

  test('호출한 쪽이 취소한 요청은 기존처럼 AbortError를 그대로 전달한다', async () => {
    switchAuthContext(1);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(pendingUntilAborted));
    const controller = new AbortController();

    const request = apiFetch('/api/job-postings/1/skills', { signal: controller.signal });
    controller.abort();

    const error = await request.catch((cause: unknown) => cause);
    expect(error).not.toBeInstanceOf(AuthContextChangedError);
    expect(error).toHaveProperty('name', 'AbortError');
  });

  test('인증 상태가 바뀐 뒤 새로 보낸 요청은 정상적으로 처리된다', async () => {
    switchAuthContext(1);
    switchAuthContext(2);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(200, {})));

    const response = await apiFetch('/api/job-postings', { method: 'POST', body: '{}' });

    expect(response.status).toBe(200);
    expect(headersOfCall(0)?.[EXPECTED_USER_HEADER]).toBe('2');
  });
});
