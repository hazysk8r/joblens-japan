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
    name: 'メモ登録',
    run: () => createJobPostingMemo(1, { content: 'memo' }),
    fallback: 'メモの登録に失敗しました。',
    successBody: memo,
  },
  {
    name: 'メモ一覧の取得',
    run: () => getJobPostingMemos(1, new AbortController().signal),
    fallback: 'メモの取得に失敗しました。',
    successBody: [memo],
  },
  {
    name: 'メモを削除',
    run: () => deleteJobPostingMemo(1, 2),
    fallback: 'メモの削除に失敗しました。',
    successBody: undefined,
  },
  {
    name: 'メモを編集',
    run: () => updateJobPostingMemo(1, 2, { content: 'memo' }),
    fallback: 'メモの編集に失敗しました。',
    successBody: memo,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jobPostingMemoApiのエラー処理', () => {
  test.each(memoOperations)(
    '$nameの失敗時にmessage、status、code、fieldErrorsを保持する',
    async ({ run }) => {
      const body = {
        message: '入力値が正しくありません。',
        code: 'VALIDATION_FAILED',
        fieldErrors: { content: 'メモは250文字以内で入力してください。' },
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
    '$name: エラー応答がJSONでなければ既定のメッセージだけを使い、応答の本文をメッセージに入れない',
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
    '$nameの成功応答は従来の結果を返す',
    async ({ run, successBody }) => {
      const response = successBody === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(successBody), { status: 200 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

      await expect(run()).resolves.toEqual(successBody);
    },
  );

  test.each(memoOperations)(
    '$name: HTTP応答のないネットワークエラーはそのまま伝える',
    async ({ run }) => {
      const error = new TypeError('Failed to fetch');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

      await expect(run()).rejects.toBe(error);
    },
  );
});
