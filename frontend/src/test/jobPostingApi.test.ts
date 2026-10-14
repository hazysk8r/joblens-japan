import {
  createJobPosting,
  deleteJobPosting,
  extractRequiredSkills,
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
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async() => ({
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
        }),
      }),
    );
  });

  afterEach(() => {
    // 他のテストにMockしたfetchの状態を残さないように元に戻す。
    vi.unstubAllGlobals();
  });

  test('일반 수정 요청에 현재 version을 If-Match 헤더로 전송한다', async() => {
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

  test('지원 상태 수정 요청에 현재 version을 If-Match 헤더로 전송한다', async () => {
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
    name: '목록 조회',
    run: () => fetchJobPostings(
      '', '', 0, 'createdAt,desc', null, null, null, null,
    ),
    fallback: '채용공고 조회에 실패했습니다.',
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
    name: '등록',
    run: () => createJobPosting(request),
    fallback: '채용공고 등록에 실패했습니다.',
    successBody: jobPosting,
  },
  {
    name: '삭제',
    run: () => deleteJobPosting(1),
    fallback: '채용공고 삭제에 실패했습니다.',
    successBody: undefined,
  },
  {
    name: '일반 수정',
    run: () => updateJobPosting(1, request, 3),
    fallback: '채용공고 수정에 실패했습니다.',
    successBody: jobPosting,
  },
  {
    name: '지원 상태 변경',
    run: () => updateApplicationStatus(1, { status: 'APPLIED' }, 3),
    fallback: '지원 상태 변경에 실패하였습니다.',
    successBody: { ...jobPosting, applicationStatus: 'APPLIED' },
  },
  {
    name: '지원 상태 요약 조회',
    run: () => fetchApplicationStatusSummary(),
    fallback: '지원 상태 요약을 불러오는 데 실패하였습니다.',
    successBody: {
      saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
    },
  },
  {
    name: '지원 상태 이력 조회',
    run: () => fetchApplicationStatusHistory(1),
    fallback: '変更履歴の取得に失敗しました。',
    successBody: [{
      id: 1,
      fromStatus: 'SAVED',
      toStatus: 'APPLIED',
      changedAt: '2026-09-17T00:00:00Z',
    }],
  },
  {
    name: '기술 스택 조회',
    run: () => extractRequiredSkills(1, new AbortController().signal),
    fallback: '기술 스택 조회에 실패하였습니다.',
    successBody: ['Java', 'AWS'],
  },
];

describe('jobPostingApi 공통 HTTP 오류 계약', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each(apiOperations)(
    '$name 실패 시 message, status, code, fieldErrors를 보존한다',
    async ({ run }) => {
      const body = {
        message: '입력 내용을 확인해 주세요.',
        code: 'VALIDATION_ERROR',
        fieldErrors: {
          salaryMin: '최소 급여를 확인해 주세요.',
          salaryMax: '최대 급여를 확인해 주세요.',
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
    '$name의 오류 응답이 JSON이 아니면 작업별 기본 메시지를 사용한다',
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
    '$name 성공 응답은 기존 결과를 반환한다',
    async ({ run, successBody }) => {
      const response = successBody === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(successBody), { status: 200 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(run()).resolves.toEqual(successBody);
    },
  );

  test.each(apiOperations)(
    '$name에서 HTTP 응답이 없는 네트워크 오류는 그대로 전달한다',
    async ({ run }) => {
      const error = new TypeError('Failed to fetch');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );

  test.each(apiOperations)(
    '$name에서 AbortError는 그대로 전달한다',
    async ({ run }) => {
      const error = new DOMException('The operation was aborted.', 'AbortError');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );

  test('기술 스택 오류 응답의 본문을 읽다가 발생한 AbortError는 그대로 전달한다', async () => {
    const error = new DOMException('The operation was aborted.', 'AbortError');
    const response = new Response('{"message":"서버 오류"}', { status: 500 });
    vi.spyOn(response, 'json').mockRejectedValue(error);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(
      extractRequiredSkills(1, new AbortController().signal),
    ).rejects.toBe(error);
  });

  test.each(apiOperations.filter(({ name }) => (
    name === '일반 수정' || name === '지원 상태 변경'
  )))(
    '$name의 412 응답은 기존 버전 충돌로 판정한다',
    async ({ run }) => {
      const body = {
        message: '다른 요청이 먼저 공고를 수정했습니다.',
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

describe('parseApiError 응답 구조 검증', () => {
  test.each([
    ['null', null],
    ['배열', [{ message: '목록 안의 메시지' }]],
    ['문자열', '서버 오류'],
    ['숫자', 400],
    ['불리언', false],
    ['빈 객체', {}],
    ['올바르지 않은 속성 타입', { message: 123, code: false, fieldErrors: [] }],
    ['빈 메시지', { message: ' \t\n ', code: '   ', fieldErrors: null }],
  ])('%s 응답이면 기본 오류 메시지를 사용한다', async (_name, body) => {
    const error = await parseApiError(
      new Response(JSON.stringify(body), { status: 500 }),
      '기본 오류 메시지',
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: '기본 오류 메시지',
      status: 500,
      code: undefined,
      fieldErrors: {},
    });
  });

  test.each([
    ['빈 응답', ''],
    ['잘못된 JSON', '{"message":'],
  ])('%s에서도 HTTP status와 기본 메시지를 보존한다', async (_name, body) => {
    const error = await parseApiError(
      new Response(body, { status: 503 }),
      '기본 오류 메시지',
    );

    expect(error).toMatchObject({
      message: '기본 오류 메시지',
      status: 503,
      code: undefined,
      fieldErrors: {},
    });
  });

  test('유효한 문자열의 원문과 화면에서 모르는 필드 이름을 보존한다', async () => {
    const body = {
      message: '  입력 내용을 확인해 주세요.  ',
      code: ' VALIDATION_ERROR ',
      fieldErrors: {
        salaryMin: ' 최소 급여 오류 ',
        salaryMax: '최대 급여 오류',
        futureField: '아직 화면에 없는 필드 오류',
        empty: '',
        blank: ' \t\n ',
        number: 100,
        boolean: false,
        null: null,
        object: { message: '중첩 객체' },
        array: ['배열 메시지'],
      },
    };

    const error = await parseApiError(
      new Response(JSON.stringify(body), { status: 400 }),
      '기본 오류 메시지',
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
    { name: '빈 배열', fieldErrors: [] },
    { name: '배열', fieldErrors: ['오류'] },
    { name: '문자열', fieldErrors: '오류' },
    { name: '숫자', fieldErrors: 123 },
    { name: '불리언', fieldErrors: false },
  ])(
    'fieldErrors가 $name이면 무시하고 일반 메시지는 보존한다',
    async ({ fieldErrors }) => {
      const error = await parseApiError(
        new Response(JSON.stringify({
          message: '일반 오류 메시지',
          code: 'SERVER_ERROR',
          fieldErrors,
        }), { status: 500 }),
        '기본 오류 메시지',
      );

      expect(error).toMatchObject({
        message: '일반 오류 메시지',
        status: 500,
        code: 'SERVER_ERROR',
        fieldErrors: {},
      });
    },
  );

  test('일반 메시지가 없더라도 유효한 code와 필드 오류를 보존한다', async () => {
    const error = await parseApiError(
      new Response(JSON.stringify({
        message: 123,
        code: 'VALIDATION_ERROR',
        fieldErrors: { title: '제목을 입력해 주세요.' },
      }), { status: 400 }),
      '기본 오류 메시지',
    );

    expect(error).toMatchObject({
      message: '기본 오류 메시지',
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: { title: '제목을 입력해 주세요.' },
    });
  });

  test('응답 본문에 다른 status가 있어도 HTTP 응답의 status를 사용한다', async () => {
    const error = await parseApiError(
      new Response(JSON.stringify({
        message: '검증 오류',
        status: 412,
        code: 'JOB_POSTING_VERSION_CONFLICT',
      }), { status: 400 }),
      '기본 오류 메시지',
    );

    expect(error.status).toBe(400);
    expect(isJobPostingVersionConflict(error)).toBe(false);
  });
});

describe('ApiError 생성자와 버전 충돌 호환성', () => {
  test('기존 두 인자 및 세 인자 생성자는 빈 fieldErrors를 제공한다', () => {
    const withoutCode = new ApiError('일반 오류', 500);
    const withCode = new ApiError('검증 오류', 400, 'VALIDATION_ERROR');

    expect(withoutCode).toBeInstanceOf(Error);
    expect(withoutCode).toMatchObject({
      name: 'ApiError',
      message: '일반 오류',
      status: 500,
      code: undefined,
      fieldErrors: {},
    });
    expect(withCode).toMatchObject({
      name: 'ApiError',
      message: '검증 오류',
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: {},
    });
  });

  test('네 번째 인자로 전달한 필드 오류를 보존한다', () => {
    const fieldErrors = { title: '제목을 입력해 주세요.' };
    const error = new ApiError('검증 오류', 400, 'VALIDATION_ERROR', fieldErrors);

    expect(error.fieldErrors).toEqual(fieldErrors);
  });

  test.each([
    new ApiError('검증 오류', 400, 'JOB_POSTING_VERSION_CONFLICT'),
    new ApiError('다른 사전 조건 오류', 412, 'OTHER_ERROR'),
    new ApiError('코드 없는 오류', 412),
    new Error('일반 오류'),
    { status: 412, code: 'JOB_POSTING_VERSION_CONFLICT' },
    null,
  ])('기존 조건을 충족하지 않는 오류(%j)는 버전 충돌로 판정하지 않는다', (error) => {
    expect(isJobPostingVersionConflict(error)).toBe(false);
  });
});
