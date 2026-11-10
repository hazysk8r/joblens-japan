import { useEffect, useRef, useState } from 'react';

import { ApiError, isJobPostingVersionConflict, userMessageOf } from '../api/apiError';
import { fetchJobPosting, updateJobPosting } from '../api/jobPostingApi';
import type { JobPosting, UpdateJobPostingRequest } from '../types/jobPosting';

const CONFLICT_MESSAGE = '別の画面で求人が編集されたため、保存できませんでした。';

/**
 * 詳細画面で求人を編集して保存する。
 *
 * 失敗しても入力は呼び出し元のフォームに残る。versionが競合した場合は、
 * 入力を捨てて最新の求人を読み込むかを利用者に選んでもらう(loadLatest)。
 */
export function useJobPostingEdit(jobPostingId: number) {
  const [saving, setSaving] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const latestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    latestControllerRef.current?.abort();
  }, []);

  function reset() {
    setError(null);
    setFieldErrors({});
    setConflict(false);
  }

  // 保存できたら応答の求人(新しいversionを含む)を返し、できなければnullを返す。
  async function save(
    request: UpdateJobPostingRequest,
    expectedVersion: number,
  ): Promise<JobPosting | null> {
    setSaving(true);
    reset();

    try {
      return await updateJobPosting(jobPostingId, request, expectedVersion);
    } catch (caught) {
      if (isJobPostingVersionConflict(caught)) {
        setConflict(true);
        setError(CONFLICT_MESSAGE);
        return null;
      }
      setError(userMessageOf(caught, '求人の保存に失敗しました。'));
      setFieldErrors(caught instanceof ApiError ? caught.fieldErrors : {});
      return null;
    } finally {
      setSaving(false);
    }
  }

  // 最新の求人を読み込めたら返し、できなければnullを返す。
  async function loadLatest(): Promise<JobPosting | null> {
    const controller = new AbortController();
    latestControllerRef.current = controller;
    setLoadingLatest(true);

    try {
      return await fetchJobPosting(jobPostingId, controller.signal);
    } catch (caught) {
      setError(userMessageOf(caught, '最新の求人を読み込めませんでした。'));
      return null;
    } finally {
      setLoadingLatest(false);
    }
  }

  return { saving, loadingLatest, error, fieldErrors, conflict, save, loadLatest, reset };
}
