import type {
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import { Link, useLocation } from 'react-router';
import './JobPostingListItem.css';
import { APPLICATION_STATUS_LABELS, formatSalaryRange } from '../utils/jobPostingFormat';
import { listReturnState } from '../utils/listReturn';
import { isHttpUrl } from '../utils/httpUrl';

import JobPostingEditForm from './JobPostingEditForm';

interface JobPostingListItemProps {
	jobPosting: JobPosting;
	isEditing: boolean;
	isSaving: boolean;
	isDeleting: boolean;
	editSessionId?: number;
	expectedVersion?: number;
	editFieldErrors?: Record<string, string>;
	editRecovery?: { pending: boolean; error: string | null };
	onRetryEditRecovery?: () => void;

	onStartEdit: (jobPosting: JobPosting) => void;
	onSave: (
		id: number,
		request: UpdateJobPostingRequest,
		expectedVersion: number,
	) => Promise<void>;
	onCancel: () => void;
	onDelete: (jobPosting: JobPosting) => Promise<void>;
}

function JobPostingListItem({
	jobPosting,
	isEditing,
	isSaving,
	isDeleting,
	editSessionId,
	expectedVersion,
	editFieldErrors,
	editRecovery,
	onRetryEditRecovery,
	onStartEdit,
	onSave,
	onCancel,
	onDelete,
}: JobPostingListItemProps) {
	const location = useLocation();

	const salaryText = formatSalaryRange(jobPosting.salaryMin, jobPosting.salaryMax);

	return (
		<li className="job-posting-card">
			{isEditing ? (
				<div className="job-posting-card__edit">
					<JobPostingEditForm
						key={editSessionId}
						jobPosting={jobPosting}
						saving={isSaving}
						expectedVersion={expectedVersion}
						fieldErrors={editFieldErrors}
						onSave={onSave}
						onCancel={onCancel}
					/>
				</div>
			) : (
				<>
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
								{jobPosting.companyName ??
									'会社名未登録'}
							</p>
							<div className="job-posting-card__meta">
								<p className="job-posting-card__salary">
									{salaryText}
								</p>

								<p className="job-posting-card__deadline">
									応募締切日：{' '}
									{jobPosting.applicationDeadline ?? '未登録'}
								</p>
							</div>
						</div>
						<p className="job-posting-card__status">
							応募ステータス: {APPLICATION_STATUS_LABELS[jobPosting.applicationStatus]}
						</p>
					</div>

					<div className="job-posting-card__body">
						<p className="job-posting-card__original-text">
							{jobPosting.originalText}
						</p>
						{jobPosting.sourceUrl && isHttpUrl(jobPosting.sourceUrl) && (
							<p className="job-posting-card__source">
								<a
									href={
										jobPosting.sourceUrl
									}
									target="_blank"
									rel="noreferrer"
								>
									原文を見る
								</a>
							</p>
						)}
					</div>
				</>
			)}

			{editRecovery && (
				<div className="job-posting-card__edit-recovery">
					{editRecovery.pending ? (
						<p role="status">最新の求人を再読み込み中…</p>
					) : (
						<>
							<p role="alert">{editRecovery.error}</p>
							<button type="button" onClick={onRetryEditRecovery}>
								最新の求人を再読み込み
							</button>
						</>
					)}
				</div>
			)}

			{!isEditing && (
				<div className="job-posting-card__footer">
					<button
						type="button"
						onClick={() =>
							onStartEdit(
								jobPosting,
							)
						}
						disabled={isDeleting || editRecovery !== undefined}
					>
						編集
					</button>

					<button
						type="button"
						className="job-posting-card__delete"
						onClick={() => {
							void onDelete(
								jobPosting,
							);
						}}
						disabled={isDeleting}
					>
						{isDeleting
							? '削除中…'
							: '削除'}
					</button>
				</div>
			)}
		</li>
	);
}

export default JobPostingListItem;
