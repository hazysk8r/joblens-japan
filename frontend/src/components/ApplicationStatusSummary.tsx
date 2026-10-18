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
        지원현황
      </h2>

      {loading && (
        <p className="application-status-summary-message" role="status">
          {summary ? '지원현황을 갱신하는 중입니다.' : '지원현황을 불러오는 중입니다.'}
        </p>
      )}

      {error && (
        <div className="application-status-summary-error" role="alert">
          <p>{error}</p>
          {summary && (
            <p>이전에 조회한 집계입니다. 최신 지원현황을 확인하려면 다시 시도해 주세요.</p>
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
          지원현황 다시 시도
        </button>
      )}

      {summary && (
        <>
          <p>
            <span>저장:</span>{' '}<strong>{summary.saved}</strong>
          </p>

          <p>
            <span>지원완료:</span>{' '}<strong>{summary.applied}</strong>
          </p>

          <p>
            <span>면접 진행 중:</span>{' '}<strong>{summary.interviewing}</strong>
          </p>

          <p>
            <span>오퍼 수령:</span>{' '}<strong>{summary.offered}</strong>
          </p>

          <p>
            <span>거절됨:</span>{' '}<strong>{summary.rejected}</strong>
          </p>
        </>
      )}
    </section>
  );
}

export default ApplicationStatusSummary;
