import { useEffect, useRef, useState } from 'react';

import { ApiError, isJobPostingVersionConflict } from '../api/apiError';
import { fetchJobPosting, updateApplicationStatus } from '../api/jobPostingApi';
import type { ApplicationStatus, JobPosting } from '../types/jobPosting';

const NOT_APPLIED_MESSAGE = '別の画面で求人が編集されたため、変更は反映されませんでした。';
const CONFLICT_MESSAGE = `${NOT_APPLIED_MESSAGE}最新の内容を表示しています。`;
const RECOVERY_FAILED_MESSAGE =
  `${NOT_APPLIED_MESSAGE}最新の求人を読み込めませんでした。ページを再読み込みしてください。`;

/**
 * 詳細画面で応募ステータスを変更する。
 *
 * 成功時は応答の求人(新しいversionを含む)をonChangedへ渡す。
 * versionが競合したら最新の求人を取得してonChangedへ渡す。
 * 最新の取得にも失敗した場合、次の変更がまた競合して同じ復旧を行う。
 */
export function useJobPostingStatusChange({
  jobPosting,
  onChanged,
}: {
  jobPosting: JobPosting;
  onChanged: (jobPosting: JobPosting) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoveryControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    recoveryControllerRef.current?.abort();
  }, []);

  async function recoverFromConflict() {
    setError(CONFLICT_MESSAGE);

    const controller = new AbortController();
    recoveryControllerRef.current = controller;

    try {
      onChanged(await fetchJobPosting(jobPosting.id, controller.signal));
    } catch {
      setError(RECOVERY_FAILED_MESSAGE);
    }
  }

  async function changeStatus(status: ApplicationStatus) {
    setUpdating(true);
    setError(null);

    try {
      const updated = await updateApplicationStatus(
        jobPosting.id,
        { status },
        jobPosting.version,
      );
      onChanged(updated);
    } catch (caught) {
      if (isJobPostingVersionConflict(caught)) {
        await recoverFromConflict();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : '応募ステータスの変更に失敗しました。');
    } finally {
      setUpdating(false);
    }
  }

  return { updating, error, changeStatus };
}
