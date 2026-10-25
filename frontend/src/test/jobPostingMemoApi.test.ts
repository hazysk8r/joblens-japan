import {
  createJobPostingMemo,
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';
import { ApiError } from '../api/apiError';

import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

const memo = {
  id: 2,
  content: 'memo',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
};

// 求人APIのエラー処理テストと同じ観点で、メモAPIの各関数を検証する。
const memoOperations = [
  {
    name: '메모 등록',
    run: () => createJobPostingMemo(1, { content: 'memo' }),
    fallback: '메모 등록에 실패했습니다.',
    successBody: memo,
  },
  {
    name: '메모 목록 조회',
    run: () => getJobPostingMemos(1),
    fallback: '메모 내용 조회에 실패하였습니다.',
    successBody: [memo],
  },
  {
    name: '메모 삭제',
    run: () => deleteJobPostingMemo(1, 2),
    fallback: '메모 삭제에 실패하였습니다.',
    successBody: undefined,
  },
  {
    name: '메모 수정',
    run: () => updateJobPostingMemo(1, 2, { content: 'memo' }),
    fallback: '메모 수정에 실패하였습니다.',
    successBody: memo,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jobPostingMemoApi 오류 처리', () => {
  test.each(memoOperations)(
    '$name 실패 시 message, status, code, fieldErrors를 보존한다',
    async ({ run }) => {
      const body = {
        message: '입력값이 올바르지 않습니다.',
        code: 'VALIDATION_FAILED',
        fieldErrors: { content: '메모는 250자 이하로 작성해주세요' },
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status: 400 }),
      ));

      const error = await run().catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ ...body, status: 400 });
    },
  );

  test.each(memoOperations)(
    '$name: 오류 응답이 JSON이 아니면 기본 메시지만 사용하고 응답 본문을 메시지에 넣지 않는다',
    async ({ run, fallback }) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('<html>Server error</html>', { status: 502 }),
      ));

      const error = await run().catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(ApiError);
      // 以前はstatusと本文をそのままメッセージに含めて画面に表示していた。
      expect(error).toMatchObject({
        message: fallback,
        status: 502,
        code: undefined,
        fieldErrors: {},
      });
    },
  );

  test.each(memoOperations)(
    '$name 성공 응답은 기존 결과를 반환한다',
    async ({ run, successBody }) => {
      const response = successBody === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(successBody), { status: 200 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(run()).resolves.toEqual(successBody);
    },
  );

  test.each(memoOperations)(
    '$name: HTTP 응답이 없는 네트워크 오류는 그대로 전달한다',
    async ({ run }) => {
      const error = new TypeError('Failed to fetch');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );
});
