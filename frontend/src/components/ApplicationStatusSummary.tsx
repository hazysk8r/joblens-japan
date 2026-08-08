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
    <section>
      <h2>
        지원현황
      </h2>

      <p>
        저장: {summary.saved}
      </p>

      <p>
        지원완료: {summary.applied}
      </p>

      <p>
        면접 진행 중: {summary.interviewing}
      </p>

      <p>
        오퍼 수령: {summary.offered}
      </p>

      <p>
        거절됨: {summary.rejected}
      </p>
    </section>
  );
}

export default ApplicationStatusSummary;