import type {
  ApplicationStatusSummaryResponse,
} from '../types/jobPosting';

interface ApplicationStatusSummaryProps {
  summary: ApplicationStatusSummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function ApplicationStatusSummary({
  summary,
  loading,
  error,
  onRetry,
}: ApplicationStatusSummaryProps) {
  return (
    <section
      className="application-status-summary"
      aria-labelledby="application-status-summary-title"
    >
      <h2 id="application-status-summary-title">
        応募状況
      </h2>

      {loading && (
        <p className="application-status-summary-message" role="status">
          {summary ? '応募状況を更新しています。' : '応募状況を読み込んでいます。'}
        </p>
      )}

      {error && (
        <div className="application-status-summary-error" role="alert">
          <p>{error}</p>
          {summary && (
            <p>以前に取得した集計です。最新の応募状況を確認するには、再試行してください。</p>
          )}
        </div>
      )}

      {(error || loading) && (
        <button
          className="application-status-summary-retry"
          type="button"
          onClick={onRetry}
          disabled={loading}
        >
          応募状況を再試行
        </button>
      )}

      {summary && (
        <>
          <p>
            <span>保存済み:</span>{' '}<strong>{summary.saved}</strong>
          </p>

          <p>
            <span>応募済み:</span>{' '}<strong>{summary.applied}</strong>
          </p>

          <p>
            <span>面接中:</span>{' '}<strong>{summary.interviewing}</strong>
          </p>

          <p>
            <span>内定:</span>{' '}<strong>{summary.offered}</strong>
          </p>

          <p>
            <span>不採用:</span>{' '}<strong>{summary.rejected}</strong>
          </p>
        </>
      )}
    </section>
  );
}

export default ApplicationStatusSummary;
