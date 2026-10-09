import type {
  ApplicationStatusSummaryResponse,
} from '../types/jobPosting';

interface ApplicationStatusSummaryProps {
  summary: ApplicationStatusSummaryResponse;
}

function ApplicationStatusSummary({
  summary,
}: ApplicationStatusSummaryProps) {
  return (
    <section className="application-status-summary">
      <h2>
        지원현황
      </h2>

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
    </section>
  );
}

export default ApplicationStatusSummary;