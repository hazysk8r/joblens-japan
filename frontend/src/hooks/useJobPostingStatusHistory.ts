import { fetchApplicationStatusHistory } from '../api/jobPostingApi';
import { useRefreshableResource } from './useRefreshableResource';

export function useJobPostingStatusHistory(jobPostingId: number) {
  return useRefreshableResource(
    jobPostingId,
    fetchApplicationStatusHistory,
    '変更履歴の取得に失敗しました。',
  );
}
