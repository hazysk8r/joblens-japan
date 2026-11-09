import {
  createJobPosting,
  deleteJobPosting,
  fetchJobPostingAnalysis,
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateJobPosting,
  updateApplicationStatus,
} from '../api/jobPostingApi';
import {
  ApiError,
  isJobPostingVersionConflict,
  parseApiError,
} from '../api/apiError';

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

describe('jobPostingApi If-Match', () => {
  beforeEach(() => {
    // 実際のHTTP通信を行わずAPIリクエスト内容を検証するため、
    // グローバルのfetchをVitestのMock関数に置き換える。
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1,
        companyName: 'Test Company',
        title: 'Engineer',
        sourceUrl: null,
        originalText: 'Java AWS',
        createdAt: '2026-09-17T00:00:00Z',
        applicationStatus: 'SAVED',
        salaryMin: null,
        salaryMax: null,
        version: 4,
      }), { status: 200 })),
    );
  });

  afterEach(() => {
    // 他のテストにMockしたfetchの状態を残さないように元に戻す。
    vi.unstubAllGlobals();
  });

  test('通常の編集リクエストに現在のversionをIf-Matchヘッダーで送る', async() => {
    await updateJobPosting(
      1,
      {
        companyName: 'Test Company',
        title: 'Engineer',
        sourceUrl: null,
        originalText: 'Java AWS',
        salaryMin: null,
        salaryMax: null,
        applicationDeadline: null,
      },
      3,
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/job-postings/1',
      // リクエスト全体ではなく、
      // 今回重要なHTTP MethodとIf-Matchヘッダーだけを検証する。
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'If-Match': '"3"',
        }),
      }),
    );
  });

  test('応募ステータスの編集リクエストに現在のversionをIf-Matchヘッダーで送る', async () => {
    await updateApplicationStatus(
      1,
      {
        status: 'APPLIED',
      },
      3,
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/job-postings/1/status',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'If-Match': '"3"',
        }),
      }),
    );
  });
});

const request = {
  companyName: 'Test Company',
  title: 'Engineer',
  sourceUrl: null,
  originalText: 'Java AWS',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
};

const jobPosting = {
  ...request,
  id: 1,
  createdAt: '2026-09-17T00:00:00Z',
  applicationStatus: 'SAVED',
  version: 4,
};

const apiOperations = [
  {
    name: '一覧の取得',
    run: () => fetchJobPostings(
      '', '', 0, 'createdAt,desc', null, null, null, null,
    ),
    fallback: '求人の取得に失敗しました。',
    successBody: {
      content: [jobPosting],
      page: 0,
      size: 5,
      totalElements: 1,
      totalPages: 1,
      first: true,
      last: true,
    },
  },
  {
    name: '登録',
    run: () => createJobPosting(request),
    fallback: '求人の登録に失敗しました。',
    successBody: jobPosting,
  },
  {
    name: '削除',
    run: () => deleteJobPosting(1),
    fallback: '求人の削除に失敗しました。',
    successBody: undefined,
  },
  {
    name: '通常の編集',
    run: () => updateJobPosting(1, request, 3),
    fallback: '求人の編集に失敗しました。',
    successBody: jobPosting,
  },
  {
    name: '応募ステータスの変更',
    run: () => updateApplicationStatus(1, { status: 'APPLIED' }, 3),
    fallback: '応募ステータスの変更に失敗しました。',
    successBody: { ...jobPosting, applicationStatus: 'APPLIED' },
  },
  {
    name: '応募ステータス集計の取得',
    run: () => fetchApplicationStatusSummary(),
    fallback: '応募状況の取得に失敗しました。',
    successBody: {
      saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
    },
  },
  {
    name: '応募ステータス履歴の取得',
    run: () => fetchApplicationStatusHistory(1, new AbortController().signal),
    fallback: '変更履歴の取得に失敗しました。',
    successBody: [{
      id: 1,
      fromStatus: 'SAVED',
      toStatus: 'APPLIED',
      changedAt: '2026-09-17T00:00:00Z',
    }],
  },
  {
    name: '求人票の分析',
    run: () => fetchJobPostingAnalysis(1, new AbortController().signal),
    fallback: '求人票の分析に失敗しました。',
    successBody: { fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] }, skills: ['Java'] },
  },
];

describe('jobPostingApiの共通HTTPエラーの契約', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each(apiOperations)(
    '$nameの失敗時にmessage、status、code、fieldErrorsを保持する',
    async ({ run }) => {
      const body = {
        message: '入力内容を確認してください。',
        code: 'VALIDATION_ERROR',
        fieldErrors: {
          salaryMin: '最低月給を確認してください。',
          salaryMax: '最高月給を確認してください。',
        },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status: 400 }),
      ));

      const error = await run().catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ ...body, status: 400 });
    },
  );

  test.each(apiOperations)(
    '$nameのエラー応答がJSONでなければ処理ごとの既定のメッセージを使う',
    async ({ run, fallback }) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('<html>Server error</html>', { status: 502 }),
      ));

      const error = await run().catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        message: fallback,
        status: 502,
        code: undefined,
        fieldErrors: {},
      });
    },
  );

  test.each(apiOperations)(
    '$nameの成功応答は従来の結果を返す',
    async ({ run, successBody }) => {
      const response = successBody === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(successBody), { status: 200 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(run()).resolves.toEqual(successBody);
    },
  );

  test.each(apiOperations)(
    '$nameでHTTP応答のないネットワークエラーはそのまま伝える',
    async ({ run }) => {
      const error = new TypeError('Failed to fetch');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );

  test.each(apiOperations)(
    '$nameでAbortErrorはそのまま伝える',
    async ({ run }) => {
      const error = new DOMException('The operation was aborted.', 'AbortError');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );

  test('求人票の分析のエラー応答の本文を読む途中で起きたAbortErrorはそのまま伝える', async () => {
    const error = new DOMException('The operation was aborted.', 'AbortError');
    const response = new Response('{"message":"サーバーエラー"}', { status: 500 });
    vi.spyOn(response, 'json').mockRejectedValue(error);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(
      fetchJobPostingAnalysis(1, new AbortController().signal),
    ).rejects.toBe(error);
  });

  test.each(apiOperations.filter(({ name }) => (
    name === '通常の編集' || name === '応募ステータスの変更'
  )))(
    '$nameの412応答は従来のバージョン競合と判定する',
    async ({ run }) => {
      const body = {
        message: '別のリクエストが先に求人を編集しました。',
        code: 'JOB_POSTING_VERSION_CONFLICT',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status: 412 }),
      ));

      const error = await run().catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ ...body, status: 412, fieldErrors: {} });
      expect(isJobPostingVersionConflict(error)).toBe(true);
    },
  );
});

describe('parseApiErrorの応答構造の検証', () => {
  test.each([
    ['null', null],
    ['配列', [{ message: '一覧の中のメッセージ' }]],
    ['文字列', 'サーバーエラー'],
    ['数値', 400],
    ['真偽値', false],
    ['空のオブジェクト', {}],
    ['正しくない属性の型', { message: 123, code: false, fieldErrors: [] }],
    ['空のメッセージ', { message: ' \t\n ', code: '   ', fieldErrors: null }],
  ])('%sの応答なら既定のエラーメッセージを使う', async (_name, body) => {
    const error = await parseApiError(
      new Response(JSON.stringify(body), { status: 500 }),
      '既定のエラーメッセージ',
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: '既定のエラーメッセージ',
      status: 500,
      code: undefined,
      fieldErrors: {},
    });
  });

  test.each([
    ['空の応答', ''],
    ['不正なJSON', '{"message":'],
  ])('%sでもHTTP statusと既定のメッセージを保持する', async (_name, body) => {
    const error = await parseApiError(
      new Response(body, { status: 503 }),
      '既定のエラーメッセージ',
    );

    expect(error).toMatchObject({
      message: '既定のエラーメッセージ',
      status: 503,
      code: undefined,
      fieldErrors: {},
    });
  });

  test('有効な文字列の原文と、画面が知らない項目名を保持する', async () => {
    const body = {
      message: '  入力内容を確認してください。  ',
      code: ' VALIDATION_ERROR ',
      fieldErrors: {
        salaryMin: ' 最低月給のエラー ',
        salaryMax: '最高月給のエラー',
        futureField: 'まだ画面にない項目のエラー',
        empty: '',
        blank: ' \t\n ',
        number: 100,
        boolean: false,
        null: null,
        object: { message: '入れ子のオブジェクト' },
        array: ['配列のメッセージ'],
      },
    };

    const error = await parseApiError(
      new Response(JSON.stringify(body), { status: 400 }),
      '既定のエラーメッセージ',
    );

    expect(error).toMatchObject({
      message: body.message,
      status: 400,
      code: body.code,
      fieldErrors: {
        salaryMin: body.fieldErrors.salaryMin,
        salaryMax: body.fieldErrors.salaryMax,
        futureField: body.fieldErrors.futureField,
      },
    });
    expect(Object.keys(error.fieldErrors)).toEqual([
      'salaryMin', 'salaryMax', 'futureField',
    ]);
  });

  test.each([
    { name: 'null', fieldErrors: null },
    { name: '空の配列', fieldErrors: [] },
    { name: '配列', fieldErrors: ['エラー'] },
    { name: '文字列', fieldErrors: 'エラー' },
    { name: '数値', fieldErrors: 123 },
    { name: '真偽値', fieldErrors: false },
  ])(
    'fieldErrorsが$nameなら無視し、全体のメッセージは保持する',
    async ({ fieldErrors }) => {
      const error = await parseApiError(
        new Response(JSON.stringify({
          message: '全体のエラーメッセージ',
          code: 'SERVER_ERROR',
          fieldErrors,
        }), { status: 500 }),
        '既定のエラーメッセージ',
      );

      expect(error).toMatchObject({
        message: '全体のエラーメッセージ',
        status: 500,
        code: 'SERVER_ERROR',
        fieldErrors: {},
      });
    },
  );

  test('全体のメッセージがなくても有効なcodeと項目のエラーを保持する', async () => {
    const error = await parseApiError(
      new Response(JSON.stringify({
        message: 123,
        code: 'VALIDATION_ERROR',
        fieldErrors: { title: 'タイトルを入力してください。' },
      }), { status: 400 }),
      '既定のエラーメッセージ',
    );

    expect(error).toMatchObject({
      message: '既定のエラーメッセージ',
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: { title: 'タイトルを入力してください。' },
    });
  });

  test('応答の本文に別のstatusがあってもHTTP応答のstatusを使う', async () => {
    const error = await parseApiError(
      new Response(JSON.stringify({
        message: '検証エラー',
        status: 412,
        code: 'JOB_POSTING_VERSION_CONFLICT',
      }), { status: 400 }),
      '既定のエラーメッセージ',
    );

    expect(error.status).toBe(400);
    expect(isJobPostingVersionConflict(error)).toBe(false);
  });
});

describe('ApiErrorのコンストラクタとバージョン競合の互換性', () => {
  test('従来の2引数と3引数のコンストラクタは空のfieldErrorsを持つ', () => {
    const withoutCode = new ApiError('全体のエラー', 500);
    const withCode = new ApiError('検証エラー', 400, 'VALIDATION_ERROR');

    expect(withoutCode).toBeInstanceOf(Error);
    expect(withoutCode).toMatchObject({
      name: 'ApiError',
      message: '全体のエラー',
      status: 500,
      code: undefined,
      fieldErrors: {},
    });
    expect(withCode).toMatchObject({
      name: 'ApiError',
      message: '検証エラー',
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: {},
    });
  });

  test('4番目の引数で渡した項目のエラーを保持する', () => {
    const fieldErrors = { title: 'タイトルを入力してください。' };
    const error = new ApiError('検証エラー', 400, 'VALIDATION_ERROR', fieldErrors);

    expect(error.fieldErrors).toEqual(fieldErrors);
  });

  test.each([
    new ApiError('検証エラー', 400, 'JOB_POSTING_VERSION_CONFLICT'),
    new ApiError('別の事前条件のエラー', 412, 'OTHER_ERROR'),
    new ApiError('コードのないエラー', 412),
    new Error('全体のエラー'),
    { status: 412, code: 'JOB_POSTING_VERSION_CONFLICT' },
    null,
  ])('従来の条件を満たさないエラー(%j)はバージョン競合と判定しない', (error) => {
    expect(isJobPostingVersionConflict(error)).toBe(false);
  });
});
