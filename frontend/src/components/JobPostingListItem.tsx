import type { ListedJobPosting } from '../types/jobPosting';

import { Link, useLocation } from 'react-router';
import './JobPostingListItem.css';
import { APPLICATION_STATUS_LABELS, excerptOf, formatSalaryRange } from '../utils/jobPostingFormat';
import { listReturnState } from '../utils/listReturn';
import { isHttpUrl } from '../utils/httpUrl';
import { fixedOvertimeVerdict } from '../utils/fixedOvertimeVerdict';

// 一覧で表示する原文の長さ。選ぶための手がかりなので、数行に収まる長さにする。
const EXCERPT_LENGTH = 100;

/**
 * 一覧の求人の要約カード。一覧は選ぶ場所のため、編集や削除などの操作は詳細画面で行う。
 */
function JobPostingListItem({ jobPosting }: { jobPosting: ListedJobPosting }) {
	const location = useLocation();
	const { fixedOvertime } = jobPosting;
	// 応答に判定がない(nullや項目自体がない)ときはバッジを出さない。一覧の表示は止めない。
	const verdict = fixedOvertime == null ? null : fixedOvertimeVerdict(fixedOvertime.status, fixedOvertime.hours);

	return (
		<li className="job-posting-card">
			<div className="job-posting-card__header">
				<div className="job-posting-card__heading">
					<h2 className="job-posting-card__title">
						{/* 一覧の検索条件を渡し、詳細画面から同じ条件の一覧へ戻れるようにする。 */}
						<Link
							to={`/job-postings/${jobPosting.id}`}
							state={listReturnState(location.search)}
						>
							{jobPosting.title}
						</Link>
					</h2>
					<p className="job-posting-card__company">
						{jobPosting.companyName ?? '会社名未登録'}
					</p>
					<div className="job-posting-card__meta">
						<p className="job-posting-card__salary">
							{formatSalaryRange(jobPosting.salaryMin, jobPosting.salaryMax)}
						</p>

						<p className="job-posting-card__deadline">
							応募締切日：{' '}
							{jobPosting.applicationDeadline ?? '未登録'}
						</p>
					</div>
					{/* 給与の近くで比べられるよう、給与と締切日の下に置く。「なし」だけでは何がないのか分からないため、項目名を付ける。 */}
					{verdict !== null && (
						<p className={`job-posting-card__badge job-posting-card__badge--${verdict.tone}`}>
							{`固定残業代 ${verdict.label}`}
						</p>
					)}
				</div>
				<p className="job-posting-card__status">
					応募ステータス: {APPLICATION_STATUS_LABELS[jobPosting.applicationStatus]}
				</p>
			</div>

			<div className="job-posting-card__body">
				{/* 画面で隠すだけだと読み上げでは全体が読まれるため、文字列を切って置く。 */}
				<p className="job-posting-card__excerpt">
					{excerptOf(jobPosting.originalText, EXCERPT_LENGTH)}
				</p>
				{jobPosting.sourceUrl && isHttpUrl(jobPosting.sourceUrl) && (
					<p className="job-posting-card__source">
						<a
							href={jobPosting.sourceUrl}
							target="_blank"
							rel="noreferrer"
						>
							原文を見る
						</a>
					</p>
				)}
			</div>
		</li>
	);
}

export default JobPostingListItem;
