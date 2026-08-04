import type {
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import JobPostingEditForm from './JobPostingEditForm';

interface JobPostingListItemProps {
	jobPosting: JobPosting;
	isEditing: boolean;
	isSaving: boolean;
	isDeleting: boolean;

	onStartEdit: (
		jobPosting: JobPosting,
	) => void;

	onSave: (
		id: number,
		request: UpdateJobPostingRequest,
	) => Promise<void>;

	onCancel: () => void;

	onDelete: (
		jobPosting: JobPosting,
	) => Promise<void>;
}

function JobPostingListItem({
	jobPosting,
	isEditing,
	isSaving,
	isDeleting,
	onStartEdit,
	onSave,
	onCancel,
	onDelete,
}: JobPostingListItemProps) {
	return (
		<li>
			{isEditing ? (
				<JobPostingEditForm
					jobPosting={jobPosting}
					saving={isSaving}
					onSave={onSave}
					onCancel={onCancel}
				/>
			) : (
				<>
					<h2>{jobPosting.title}</h2>

					<p>
						{jobPosting.companyName ??
							'회사명 미등록'}
					</p>

					{jobPosting.sourceUrl && (
						<p>
							<a
								href={jobPosting.sourceUrl}
								target="_blank"
								rel="noreferrer"
							>
								원문 보기
							</a>
						</p>
					)}

					<p>
						{jobPosting.originalText}
					</p>

					<button
						type="button"
						onClick={() => {
							onStartEdit(jobPosting);
						}}
						disabled={isDeleting}
					>
						수정
					</button>

					<button
						type="button"
						onClick={() => {
							void onDelete(jobPosting);
						}}
						disabled={
							isDeleting
						}
					>
						{isDeleting
							? '삭제 중...'
							: '삭제'}
					</button>
				</>
			)}
		</li>
	);
}

export default JobPostingListItem;