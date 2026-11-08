import { useEffect, useRef, useState } from 'react';

import { fetchJobPostingAnalysis } from '../api/jobPostingApi';
import type { JobPosting, JobPostingAnalysis } from '../types/jobPosting';

/**
 * 求人票の分析結果の取得と、表示・非表示の切り替えを管理する。
 *
 * 状態の遷移:
 * - 閉じている → (toggle) → 取得中 → 表示 / エラー
 * - 表示 → (toggle) → 閉じている(結果は残し、次に開くときは再取得しない)
 * - 原文が変わる → 以前の結果とエラーは使わない(次のtoggleで再取得する)
 */
export function useJobPostingAnalysis(
  jobPosting: Pick<JobPosting, 'id' | 'originalText'>,
) {
  const [analysis, setAnalysis] = useState<JobPostingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  // 結果を取得したときの原文。現在の原文と違えば、その結果は古い。
  const [analyzedOriginalText, setAnalyzedOriginalText] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [jobPosting.id, jobPosting.originalText]);

  // 求人原文が更新された場合、以前の原文から取得した結果を使用しないようにする。
  const isCacheValid = analyzedOriginalText === jobPosting.originalText;

  // visibleだけでは、原文の更新で古い結果を隠している間もtrueのままになる。
  const isShown = isCacheValid && analysis !== null && visible;

  async function toggle() {
    if (analysis !== null && isCacheValid) {
      setVisible((previous) => !previous);
      return;
    }

    const requestOriginalText = jobPosting.originalText;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchJobPostingAnalysis(
        jobPosting.id,
        controller.signal,
      );

      // すでに新しいリクエストが開始されている場合は、この結果を反映しない
      if (controller.signal.aborted) {
        return;
      }

      setAnalysis(result);
      setAnalyzedOriginalText(requestOriginalText);
      setVisible(true);
    } catch (caught) {
      // 意図的にキャンセルされた場合は、エラー表示用のStateを変更しない
      if (
        caught instanceof DOMException &&
        caught.name === 'AbortError'
      ) {
        return;
      }

      setAnalysis(null);
      setAnalyzedOriginalText(requestOriginalText);
      setVisible(false);

      if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError('求人票の分析に失敗しました。');
      }
    } finally {
      // 現在のリクエストが最新の場合のみ、ローディング状態を終了する
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }

  return {
    analysis: isShown ? analysis : null,
    // 原文が変わった後は、以前の原文に対するエラーを表示しない。
    error: isCacheValid ? error : null,
    loading,
    isShown,
    toggle,
  };
}
