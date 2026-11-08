import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from '../api/apiError';
import { fetchJobPosting } from '../api/jobPostingApi';
import { useJobPostingDetail } from '../hooks/useJobPostingDetail';
import type { JobPosting } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

const jobPosting: JobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  originalText: '原文',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useJobPostingDetail', () => {
  test('画面を離れると通信を取り消し、後から届いた応答は使わない', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(fetchJobPosting).mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useJobPostingDetail(5));
    const signal = vi.mocked(fetchJobPosting).mock.calls[0][1];
    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(jobPosting);
    });
    expect(result.current.state).toEqual({ status: 'loading' });
  });

  test('再試行すると前の通信を取り消し、前の通信の遅れた失敗で結果を上書きしない', async () => {
    const first = deferred<JobPosting>();
    const second = deferred<JobPosting>();
    vi.mocked(fetchJobPosting)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useJobPostingDetail(5));
    act(() => {
      result.current.retry();
    });
    const firstSignal = vi.mocked(fetchJobPosting).mock.calls[0][1];
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      second.resolve(jobPosting);
    });
    expect(result.current.state).toEqual({ status: 'loaded', jobPosting });

    await act(async () => {
      first.reject(new ApiError('サーバーでエラーが発生しました。', 500));
    });
    expect(result.current.state).toEqual({ status: 'loaded', jobPosting });
  });

  test('前の通信の遅れた成功で、新しい通信の結果を上書きしない', async () => {
    const first = deferred<JobPosting>();
    const second = deferred<JobPosting>();
    vi.mocked(fetchJobPosting)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useJobPostingDetail(5));
    act(() => {
      result.current.retry();
    });

    await act(async () => {
      first.resolve({ ...jobPosting, title: '古い応答' });
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      second.resolve(jobPosting);
    });
    expect(result.current.state).toEqual({ status: 'loaded', jobPosting });
  });

  test('IDが変わると前のIDの結果を表示せず、読み込み中に戻る', async () => {
    const other = deferred<JobPosting>();
    vi.mocked(fetchJobPosting)
      .mockResolvedValueOnce(jobPosting)
      .mockReturnValueOnce(other.promise);

    const { result, rerender } = renderHook(({ id }) => useJobPostingDetail(id), {
      initialProps: { id: 5 },
    });
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));

    rerender({ id: 6 });

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(fetchJobPosting).toHaveBeenLastCalledWith(6, expect.any(AbortSignal));
  });

  test('404は見つからない状態にする', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(new ApiError('求人が見つかりません。', 404));

    const { result } = renderHook(() => useJobPostingDetail(5));

    await waitFor(() => expect(result.current.state).toEqual({ status: 'notFound' }));
  });
});
