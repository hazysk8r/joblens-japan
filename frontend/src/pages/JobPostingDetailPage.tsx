import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import './JobPostingDetailPage.css';
import ApplicationStatusControl from '../components/ApplicationStatusControl';
import JobPostingAnalysisPanel from '../components/JobPostingAnalysisPanel';
import JobPostingMemoSection from '../components/JobPostingMemoSection';
import JobPostingStatusHistorySection from '../components/JobPostingStatusHistorySection';
import { useJobPostingAnalysis } from '../hooks/useJobPostingAnalysis';
import { useJobPostingDetail } from '../hooks/useJobPostingDetail';
import { useJobPostingStatusChange } from '../hooks/useJobPostingStatusChange';
import { useJobPostingStatusHistory } from '../hooks/useJobPostingStatusHistory';
import type { JobPosting } from '../types/jobPosting';
import { formatDateTime } from '../utils/date';
import { isHttpUrl } from '../utils/httpUrl';
import { formatSalaryRange } from '../utils/jobPostingFormat';
import { listPathFromState } from '../utils/listReturn';

// URLのIDとして受け付ける形。先頭の0や符号、小数、指数表記は受け付けない。
const ID_PATTERN = /^[1-9]\d*$/;

function parseJobPostingId(value: string | undefined): number | null {
  if (value === undefined || !ID_PATTERN.test(value)) {
    return null;
  }
  const id = Number(value);
  // JavaScriptの数値で正確に表せない大きなIDは、丸められた別のIDをAPIに送ってしまうため受け付けない。
  return Number.isSafeInteger(id) ? id : null;
}

// 詳細画面の共通部分。どの状態でも一覧へ戻れるようにする。
function DetailLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <main className="detail-page">
      <header className="detail-page-header">
        <h1>JobLens Japan</h1>

        <Link
          to={listPathFromState(location.state)}
          className="back-to-home-link"
        >
          ← 求人一覧に戻る
        </Link>
      </header>

      <div className="detail-page-content">
        {children}
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <section className="detail-page-message">
      <h2>求人が見つかりません</h2>
      <p>削除されたか、URLが間違っている可能性があります。</p>
    </section>
  );
}

// 分析は求人を取得できてから要求する。失敗しても、求人の情報と原文の表示には影響させない。
function JobPostingAnalysisBody({ jobPosting }: { jobPosting: JobPosting }) {
  const { state, retry } = useJobPostingAnalysis(jobPosting);

  switch (state.status) {
    case 'loading':
      return <p>分析中…</p>;

    case 'error':
      return (
        <>
          <p role="alert">{state.message}</p>
          <button type="button" onClick={retry}>分析を再試行</button>
        </>
      );

    case 'loaded':
      return <JobPostingAnalysisPanel analysis={state.analysis} />;

    default: {
      // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

const PAGE_SECTIONS = [
  { headingId: 'detail-analysis-heading', label: '分析' },
  { headingId: 'detail-original-heading', label: '原文' },
  { headingId: 'detail-memo-heading', label: 'メモ' },
  { headingId: 'detail-history-heading', label: '変更履歴' },
];

// URLのハッシュで移動すると履歴のstateが失われ、検索条件の付いた一覧へ戻れなくなるため、ボタンで移動する。
function PageSectionNav() {
  function moveTo(headingId: string) {
    const heading = document.getElementById(headingId);
    heading?.scrollIntoView();
    heading?.focus({ preventScroll: true });
  }

  return (
    <nav className="detail-posting__section-nav" aria-label="ページ内の移動">
      {PAGE_SECTIONS.map(({ headingId, label }) => (
        <button key={headingId} type="button" onClick={() => moveTo(headingId)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

// 分析は原文から作るため、応募ステータスを変更しても取り直さない。
function JobPostingDetail({
  jobPosting,
  onJobPostingChange,
}: {
  jobPosting: JobPosting;
  onJobPostingChange: (jobPosting: JobPosting) => void;
}) {
  const statusHistory = useJobPostingStatusHistory(jobPosting.id);
  const { updating, error: statusError, changeStatus } = useJobPostingStatusChange({
    jobPosting,
    onChanged: (changed) => {
      onJobPostingChange(changed);
      void statusHistory.refresh();
    },
  });

  return (
    <article className="detail-posting">
      <header className="detail-posting__header">
        <h2 className="detail-posting__title">{jobPosting.title}</h2>
        <p className="detail-posting__company">
          {jobPosting.companyName ?? '会社名未登録'}
        </p>
      </header>

      <dl className="detail-posting__facts">
        <div>
          <dt>給与</dt>
          <dd>{formatSalaryRange(jobPosting.salaryMin, jobPosting.salaryMax)}</dd>
        </div>
        <div>
          <dt>応募締切日</dt>
          <dd>{jobPosting.applicationDeadline ?? '未登録'}</dd>
        </div>
        <div>
          <dt><label htmlFor="detail-application-status">応募ステータス</label></dt>
          <dd>
            <ApplicationStatusControl
              id="detail-application-status"
              jobPosting={jobPosting}
              updating={updating}
              onSubmit={(status) => {
                void changeStatus(status);
              }}
            />
          </dd>
        </div>
        <div>
          <dt>登録日時</dt>
          <dd>{formatDateTime(jobPosting.createdAt)}</dd>
        </div>
      </dl>

      {statusError !== null && (
        <p role="alert" className="detail-posting__status-error">{statusError}</p>
      )}

      {jobPosting.sourceUrl && isHttpUrl(jobPosting.sourceUrl) && (
        <p className="detail-posting__source">
          <a href={jobPosting.sourceUrl} target="_blank" rel="noreferrer">
            原文を見る
          </a>
        </p>
      )}

      <PageSectionNav />

      <section
        className="detail-posting__analysis"
        aria-labelledby="detail-analysis-heading"
      >
        <h3 id="detail-analysis-heading" tabIndex={-1}>求人票の分析</h3>
        <JobPostingAnalysisBody jobPosting={jobPosting} />
      </section>

      <section
        className="detail-posting__original"
        aria-labelledby="detail-original-heading"
      >
        <h3 id="detail-original-heading" tabIndex={-1}>求人票の原文</h3>
        <p className="detail-posting__original-text">{jobPosting.originalText}</p>
      </section>

      <JobPostingMemoSection jobPostingId={jobPosting.id} />

      <JobPostingStatusHistorySection
        state={statusHistory.state}
        onRetry={statusHistory.retry}
        onRefresh={() => {
          void statusHistory.refresh();
        }}
      />
    </article>
  );
}

function JobPostingDetailContent({ id }: { id: number }) {
  const { state, retry, replaceJobPosting } = useJobPostingDetail(id);

  switch (state.status) {
    case 'loading':
      return <p className="detail-page-message">読み込み中…</p>;

    case 'notFound':
      return <NotFound />;

    case 'error':
      return (
        <section className="detail-page-message">
          <p role="alert">{state.message}</p>
          <button type="button" onClick={retry}>再試行</button>
        </section>
      );

    case 'loaded':
      return (
        <JobPostingDetail
          jobPosting={state.jobPosting}
          onJobPostingChange={replaceJobPosting}
        />
      );

    default: {
      // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/**
 * 求人の詳細画面(/job-postings/:id)。
 * 形の正しくないIDは、通信せずに見つからない求人として扱う。
 */
function JobPostingDetailPage() {
  const { id } = useParams();
  const jobPostingId = parseJobPostingId(id);

  return (
    <DetailLayout>
      {jobPostingId === null
        ? <NotFound />
        : <JobPostingDetailContent id={jobPostingId} />}
    </DetailLayout>
  );
}

export default JobPostingDetailPage;
