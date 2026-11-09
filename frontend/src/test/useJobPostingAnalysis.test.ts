import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { fetchJobPostingAnalysis } from '../api/jobPostingApi';
import { useJobPostingAnalysis } from '../hooks/useJobPostingAnalysis';
import type { JobPostingAnalysis } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

afterEach(() => {
  vi.resetAllMocks();
});

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
  skills: ['Java'],
};

test('取り消した古いリクエストの応答が後から届いても、新しいリクエストの結果を上書きしない', async () => {
  const oldRequest = deferred<JobPostingAnalysis>();
  const newRequest = deferred<JobPostingAnalysis>();
  vi.mocked(fetchJobPostingAnalysis)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);

  const { result } = renderHook(() => useJobPostingAnalysis({ id: 1, originalText: '求人' }));

  let oldToggle!: Promise<void>;
  let newToggle!: Promise<void>;
  act(() => {
    oldToggle = result.current.toggle();
  });
  act(() => {
    newToggle = result.current.toggle();
  });

  await act(async () => {
    newRequest.resolve(analysis);
    await newToggle;
  });
  await act(async () => {
    oldRequest.resolve({ ...analysis, skills: ['古い応答'] });
    await oldToggle;
  });

  expect(result.current.analysis).toEqual(analysis);
});

// 画面では処理中にボタンを無効にしているため、フックを直接呼んで重なった場合を確かめる。
test('取り消した古いリクエストが後から終わっても、新しいリクエストの処理中の状態を解除しない', async () => {
  const oldRequest = deferred<JobPostingAnalysis>();
  const newRequest = deferred<JobPostingAnalysis>();
  vi.mocked(fetchJobPostingAnalysis)
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);

  const { result } = renderHook(() => useJobPostingAnalysis({ id: 1, originalText: '求人' }));

  let oldToggle!: Promise<void>;
  let newToggle!: Promise<void>;
  act(() => {
    oldToggle = result.current.toggle();
  });
  act(() => {
    newToggle = result.current.toggle();
  });

  const oldSignal = vi.mocked(fetchJobPostingAnalysis).mock.calls[0][1];
  expect(oldSignal.aborted).toBe(true);

  await act(async () => {
    oldRequest.reject(new DOMException('The operation was aborted.', 'AbortError'));
    await oldToggle;
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBeNull();

  await act(async () => {
    newRequest.resolve(analysis);
    await newToggle;
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.analysis).toEqual(analysis);
});
