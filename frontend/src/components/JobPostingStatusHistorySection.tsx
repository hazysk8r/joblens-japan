import type { RefreshableResourceState } from '../hooks/useRefreshableResource';
import type { JobPostingStatusHistory } from '../types/jobPosting';
import { formatDateTime } from '../utils/date';
import { APPLICATION_STATUS_LABELS } from '../utils/jobPostingFormat';

interface JobPostingStatusHistorySectionProps {
  state: RefreshableResourceState<JobPostingStatusHistory[]>;
  onRetry: () => void;
  onRefresh: () => void;
}

function HistoryList({ history }: { history: JobPostingStatusHistory[] }) {
  if (history.length === 0) {
    return <p>変更履歴はありません。</p>;
  }

  return (
    <ul className="detail-history__list">
      {history.map((entry) => (
        <li key={entry.id}>
          <span>
            {APPLICATION_STATUS_LABELS[entry.fromStatus]}
            {' → '}
            {APPLICATION_STATUS_LABELS[entry.toStatus]}
          </span>
          <time dateTime={entry.changedAt}>{formatDateTime(entry.changedAt)}</time>
        </li>
      ))}
    </ul>
  );
}

/** 詳細画面の変更履歴の領域。応募ステータスの変更後に取り直すため、状態は親が持つ。 */
function JobPostingStatusHistorySection({
  state,
  onRetry,
  onRefresh,
}: JobPostingStatusHistorySectionProps) {
  function renderBody() {
    switch (state.status) {
      case 'loading':
        return <p>変更履歴を読み込み中…</p>;

      case 'error':
        return (
          <>
            <p role="alert">{state.message}</p>
            <button type="button" onClick={onRetry}>変更履歴を再試行</button>
          </>
        );

      case 'loaded':
        return (
          <>
            {state.refreshError !== null && (
              <>
                <p role="alert">{state.refreshError}</p>
                <button type="button" onClick={onRefresh}>変更履歴を再読み込み</button>
              </>
            )}
            <HistoryList history={state.data} />
          </>
        );

      default: {
        // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
        const unhandled: never = state;
        return unhandled;
      }
    }
  }

  return (
    <section className="detail-activity" aria-labelledby="detail-history-heading">
      <h3 id="detail-history-heading" tabIndex={-1}>変更履歴</h3>
      {renderBody()}
    </section>
  );
}

export default JobPostingStatusHistorySection;
