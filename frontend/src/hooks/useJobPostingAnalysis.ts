import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/apiError';
import { fetchJobPostingAnalysis } from '../api/jobPostingApi';
import type { JobPosting, JobPostingAnalysis } from '../types/jobPosting';

export type JobPostingAnalysisState =
  | { status: 'loading' }
  | { status: 'loaded'; analysis: JobPostingAnalysis }
  | { status: 'error'; message: string };

const LOADING: JobPostingAnalysisState = { status: 'loading' };

/**
 * 詳細画面で表示する求人票の分析結果を取得する。結果は保存されず、原文から毎回分析される。
 *
 * 結果は「どの求人のどの原文の何回目の取得か」と一緒に保持し、今の値と合わない結果は読み込み中として扱う。
 * 原文が変わった直後や再試行の直後に、前の結果やエラーを表示しないため。
 * 前の通信は取り消し、取り消した通信の結果は反映しない。
 */
export function useJobPostingAnalysis({
  id,
  originalText,
}: Pick<JobPosting, 'id' | 'originalText'>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: number;
    originalText: string;
    attempt: number;
    state: JobPostingAnalysisState;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: JobPostingAnalysisState) => {
      if (!controller.signal.aborted) {
        setResult({ id, originalText, attempt, state });
      }
    };

    fetchJobPostingAnalysis(id, controller.signal).then(
      (analysis) => settle({ status: 'loaded', analysis }),
      (caught: unknown) => {
        // サーバーのメッセージだけを表示する。通信エラーやJSONの解析エラーの文言は英語で、応答の本文を含むこともある。
        settle({
          status: 'error',
          message: caught instanceof ApiError ? caught.message : '求人票の分析に失敗しました。',
        });
      },
    );

    return () => {
      controller.abort();
    };
  }, [id, originalText, attempt]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const isCurrent = result !== null
    && result.id === id
    && result.originalText === originalText
    && result.attempt === attempt;

  return {
    state: isCurrent ? result.state : LOADING,
    retry,
  };
}
