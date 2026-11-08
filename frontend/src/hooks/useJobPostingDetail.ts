import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/apiError';
import { fetchJobPosting } from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';

export type JobPostingDetailState =
  | { status: 'loading' }
  | { status: 'loaded'; jobPosting: JobPosting }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

const LOADING: JobPostingDetailState = { status: 'loading' };

/**
 * 詳細画面で表示する求人を1件取得する。
 *
 * 結果は「どのIDの何回目の取得か」と一緒に保持し、今のIDと試行回数に合わない結果は読み込み中として扱う。
 * IDが変わった直後や再試行の直後に、前の結果(別の求人や前回のエラー)を表示しないため。
 * 前の通信は取り消し、取り消した通信の結果は反映しない。
 */
export function useJobPostingDetail(id: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: number;
    attempt: number;
    state: JobPostingDetailState;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: JobPostingDetailState) => {
      if (!controller.signal.aborted) {
        setResult({ id, attempt, state });
      }
    };

    fetchJobPosting(id, controller.signal).then(
      (jobPosting) => settle({ status: 'loaded', jobPosting }),
      (caught: unknown) => {
        // 他のユーザーの求人も404になる。再試行しても結果は変わらないため、エラーとは分ける。
        if (caught instanceof ApiError && caught.status === 404) {
          settle({ status: 'notFound' });
          return;
        }
        settle({
          status: 'error',
          message: caught instanceof Error ? caught.message : '求人の取得に失敗しました。',
        });
      },
    );

    return () => {
      controller.abort();
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const isCurrent = result !== null && result.id === id && result.attempt === attempt;

  return {
    state: isCurrent ? result.state : LOADING,
    retry,
  };
}
