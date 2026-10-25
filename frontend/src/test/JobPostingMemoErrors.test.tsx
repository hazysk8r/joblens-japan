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

const contentFieldError = '메모는 250자 이하로 작성해주세요';

function validationError(fieldErrors: Record<string, string>) {
  return new ApiError('입력값이 올바르지 않습니다.', 400, 'VALIDATION_FAILED', fieldErrors);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('메모 등록 폼의 오류 표시', () => {
  async function submitMemo() {
    const user = userEvent.setup();
    render(<JobPostingMemoCreateForm jobPostingId={1} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('메모내용'), 'memo');
    await user.click(screen.getByRole('button', { name: '등록' }));
  }

  test('서버가 content 검증 오류를 반환하면 전체 메시지 대신 필드 메시지를 표시한다', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(
      validationError({ content: contentFieldError }),
    );

    await submitMemo();

    expect(await screen.findByRole('alert')).toHaveTextContent(contentFieldError);
    expect(screen.queryByText('입력값이 올바르지 않습니다.')).not.toBeInTheDocument();
  });

  test('필드 오류가 없으면 서버 메시지를 표시한다', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(
      new ApiError('채용공고를 찾을 수 없습니다. id=1', 404, 'JOB_POSTING_NOT_FOUND'),
    );

    await submitMemo();

    expect(await screen.findByRole('alert')).toHaveTextContent('채용공고를 찾을 수 없습니다. id=1');
  });
});

describe('메모 수정의 오류 표시', () => {
  test('서버가 content 검증 오류를 반환하면 수정 오류로 필드 메시지를 표시하고 편집 상태를 유지한다', async () => {
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

  test('필드 오류가 없으면 서버 메시지를 수정 오류로 표시한다', async () => {
    vi.mocked(updateJobPostingMemo).mockRejectedValue(
      new ApiError('메모를 찾을 수 없습니다.', 404, 'MEMO_NOT_FOUND'),
    );
    const { result } = renderHook(() => useJobPostingMemos(1));

    await act(async () => {
      await result.current.saveMemoEdit(2, { content: 'memo' });
    });

    expect(result.current.memoUpdateError).toBe('메모를 찾을 수 없습니다.');
  });
});
