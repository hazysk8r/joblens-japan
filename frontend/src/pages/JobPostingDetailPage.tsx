import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import './JobPostingDetailPage.css';
import { useJobPostingDetail } from '../hooks/useJobPostingDetail';
import type { JobPosting } from '../types/jobPosting';
import { formatDateTime } from '../utils/date';
import { isHttpUrl } from '../utils/httpUrl';
import { APPLICATION_STATUS_LABELS, formatSalaryRange } from '../utils/jobPostingFormat';
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

function JobPostingDetail({ jobPosting }: { jobPosting: JobPosting }) {
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
          <dt>応募ステータス</dt>
          <dd>{APPLICATION_STATUS_LABELS[jobPosting.applicationStatus]}</dd>
        </div>
        <div>
          <dt>登録日時</dt>
          <dd>{formatDateTime(jobPosting.createdAt)}</dd>
        </div>
      </dl>

      {jobPosting.sourceUrl && isHttpUrl(jobPosting.sourceUrl) && (
        <p className="detail-posting__source">
          <a href={jobPosting.sourceUrl} target="_blank" rel="noreferrer">
            原文を見る
          </a>
        </p>
      )}

      <section
        className="detail-posting__original"
        aria-labelledby="detail-original-heading"
      >
        <h3 id="detail-original-heading">求人票の原文</h3>
        <p className="detail-posting__original-text">{jobPosting.originalText}</p>
      </section>
    </article>
  );
}

function JobPostingDetailPage({ id }: { id: number }) {
  const { state, retry } = useJobPostingDetail(id);

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
      return <JobPostingDetail jobPosting={state.jobPosting} />;

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
function JobPostingDetailRoute() {
  const { id } = useParams();
  const jobPostingId = parseJobPostingId(id);

  return (
    <DetailLayout>
      {jobPostingId === null
        ? <NotFound />
        : <JobPostingDetailPage id={jobPostingId} />}
    </DetailLayout>
  );
}

export default JobPostingDetailRoute;
