import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from '../api/apiError';
import { fetchJobPostingAnalysis } from '../api/jobPostingApi';
import { useJobPostingAnalysis } from '../hooks/useJobPostingAnalysis';
import type { JobPostingAnalysis } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const analysis: JobPostingAnalysis = {
  fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
  skills: [{ name: 'Java', level: 'MENTIONED', alternatives: [], evidence: [] }],
};
const posting = { id: 1, originalText: '求人' };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useJobPostingAnalysis', () => {
  test('開くと取得して結果を返す', async () => {
    vi.mocked(fetchJobPostingAnalysis).mockResolvedValue(analysis);

    const { result } = renderHook(() => useJobPostingAnalysis(posting));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', analysis }));
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(1);
    expect(fetchJobPostingAnalysis).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  test('画面を離れると通信を取り消し、後から届いた応答は使わない', async () => {
    const pending = deferred<JobPostingAnalysis>();
    vi.mocked(fetchJobPostingAnalysis).mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useJobPostingAnalysis(posting));
    const signal = vi.mocked(fetchJobPostingAnalysis).mock.calls[0][1];
    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(analysis);
    });
    expect(result.current.state).toEqual({ status: 'loading' });
  });

  test('再試行すると前の通信を取り消し、前の通信の遅れた失敗で結果を上書きしない', async () => {
    const first = deferred<JobPostingAnalysis>();
    const second = deferred<JobPostingAnalysis>();
    vi.mocked(fetchJobPostingAnalysis)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useJobPostingAnalysis(posting));
    act(() => {
      result.current.retry();
    });
    expect(vi.mocked(fetchJobPostingAnalysis).mock.calls[0][1].aborted).toBe(true);

    await act(async () => {
      second.resolve(analysis);
    });
    await act(async () => {
      first.reject(new ApiError('サーバーでエラーが発生しました。', 500));
    });

    expect(result.current.state).toEqual({ status: 'loaded', analysis });
  });

  test('前の通信の遅れた成功で、新しい通信の結果を上書きしない', async () => {
    const first = deferred<JobPostingAnalysis>();
    const second = deferred<JobPostingAnalysis>();
    vi.mocked(fetchJobPostingAnalysis)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useJobPostingAnalysis(posting));
    act(() => {
      result.current.retry();
    });

    await act(async () => {
      second.resolve(analysis);
    });
    await act(async () => {
      first.resolve({ ...analysis, skills: [{ name: '古い応答', level: 'MENTIONED', alternatives: [], evidence: [] }] });
    });

    expect(result.current.state).toEqual({ status: 'loaded', analysis });
  });

  test('失敗の後に再試行すると読み込み中に戻り、前のエラーを見せない', async () => {
    const retried = deferred<JobPostingAnalysis>();
    vi.mocked(fetchJobPostingAnalysis)
      .mockRejectedValueOnce(new ApiError('サーバーでエラーが発生しました。', 500))
      .mockReturnValueOnce(retried.promise);

    const { result } = renderHook(() => useJobPostingAnalysis(posting));
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => {
      result.current.retry();
    });

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['原文', { id: 1, originalText: '変更後の求人' }],
    ['ID', { id: 2, originalText: '求人' }],
  ])('%sが変わると前の結果を見せず、前の通信を取り消して取り直す', async (_, next) => {
    const nextRequest = deferred<JobPostingAnalysis>();
    vi.mocked(fetchJobPostingAnalysis)
      .mockResolvedValueOnce(analysis)
      .mockReturnValueOnce(nextRequest.promise);

    const { result, rerender } = renderHook(
      (props) => useJobPostingAnalysis(props),
      { initialProps: posting },
    );
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    const firstSignal = vi.mocked(fetchJobPostingAnalysis).mock.calls[0][1];

    rerender(next);

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(firstSignal.aborted).toBe(true);
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2);
    expect(fetchJobPostingAnalysis).toHaveBeenLastCalledWith(next.id, expect.any(AbortSignal));
  });

  test('サーバーのメッセージはそのまま使う', async () => {
    vi.mocked(fetchJobPostingAnalysis).mockRejectedValue(new ApiError('求人が見つかりません。', 404));

    const { result } = renderHook(() => useJobPostingAnalysis(posting));

    await waitFor(() => expect(result.current.state)
      .toEqual({ status: 'error', message: '求人が見つかりません。' }));
  });

  test.each([
    ['通信エラー', new TypeError('Failed to fetch')],
    ['Errorでない値', 'unknown'],
  ])('%sは既定のメッセージにする', async (_, failure) => {
    vi.mocked(fetchJobPostingAnalysis).mockRejectedValue(failure);

    const { result } = renderHook(() => useJobPostingAnalysis(posting));

    await waitFor(() => expect(result.current.state)
      .toEqual({ status: 'error', message: '求人票の分析に失敗しました。' }));
  });
});
