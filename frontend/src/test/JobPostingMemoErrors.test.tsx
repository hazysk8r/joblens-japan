import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import JobPostingMemoCreateForm from '../components/JobPostingMemoCreateForm';
import { useJobPostingMemos } from '../hooks/useJobPostingMemos';
import { ApiError } from '../api/apiError';
import {
  createJobPostingMemo,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';

vi.mock('../api/jobPostingMemoApi');

const contentFieldError = 'メモは250文字以内で入力してください。';

function validationError(fieldErrors: Record<string, string>) {
  return new ApiError('入力値が正しくありません。', 400, 'VALIDATION_FAILED', fieldErrors);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('メモ登録フォームのエラー表示', () => {
  async function submitMemo() {
    const user = userEvent.setup();
    render(<JobPostingMemoCreateForm jobPostingId={1} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('メモ内容'), 'memo');
    await user.click(screen.getByRole('button', { name: '登録' }));
  }

  test('サーバーがcontentの検証エラーを返すと、全体のメッセージの代わりに項目のメッセージを表示する', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(
      validationError({ content: contentFieldError }),
    );

    await submitMemo();

    expect(await screen.findByRole('alert')).toHaveTextContent(contentFieldError);
    expect(screen.queryByText('入力値が正しくありません。')).not.toBeInTheDocument();
  });

  test('項目のエラーがなければサーバーのメッセージを表示する', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(
      new ApiError('求人が見つかりません。id=1', 404, 'JOB_POSTING_NOT_FOUND'),
    );

    await submitMemo();

    expect(await screen.findByRole('alert')).toHaveTextContent('求人が見つかりません。id=1');
  });
});

describe('メモ編集のエラー表示', () => {
  test('サーバーがcontentの検証エラーを返すと、編集エラーとして項目のメッセージを表示し編集状態を維持する', async () => {
    vi.mocked(updateJobPostingMemo).mockRejectedValue(
      validationError({ content: contentFieldError }),
    );
    const { result } = renderHook(() => useJobPostingMemos(1));

    act(() => {
      result.current.startMemoEdit(2);
    });
    await act(async () => {
      await result.current.saveMemoEdit(2, { content: 'memo' });
    });

    expect(result.current.memoUpdateError).toBe(contentFieldError);
    expect(result.current.editingMemoId).toBe(2);
  });

  test('項目のエラーがなければサーバーのメッセージを編集エラーとして表示する', async () => {
    vi.mocked(updateJobPostingMemo).mockRejectedValue(
      new ApiError('メモが見つかりません。', 404, 'MEMO_NOT_FOUND'),
    );
    const { result } = renderHook(() => useJobPostingMemos(1));

    await act(async () => {
      await result.current.saveMemoEdit(2, { content: 'memo' });
    });

    expect(result.current.memoUpdateError).toBe('メモが見つかりません。');
  });
});
