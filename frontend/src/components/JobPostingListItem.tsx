import type {
	ApplicationStatus,
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import JobPostingEditForm from './JobPostingEditForm';

interface JobPostingListItemProps {
	jobPosting: JobPosting;
	isEditing: boolean;
	isSaving: boolean;
	isDeleting: boolean;
	isUpdatingStatus: boolean;

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

	onApplicationStatusChange: (
		id: number,
		status: ApplicationStatus,
	) => Promise<void>;
}

function JobPostingListItem({
	jobPosting,
	isEditing,
	isSaving,
	isDeleting,
	isUpdatingStatus,
	onStartEdit,
	onSave,
	onCancel,
	onDelete,
	onApplicationStatusChange,
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

					<p>
						<label>
							지원 상태:

							<select
								value={jobPosting.applicationStatus}
								disabled={isUpdatingStatus}
								onChange={(event) => {
									void onApplicationStatusChange(
										jobPosting.id,
										event.target.value as ApplicationStatus,
									);
								}}
							>
								<option value="SAVED">저장</option>
								<option value="APPLIED">지원완료</option>
								<option value="INTERVIEWING">면접 진행 중</option>
								<option value="OFFERED">오퍼수령</option>
								<option value="REJECTED">거절됨</option>
							</select>
						</label>
						{isUpdatingStatus && <span>상태 변경 중...</span>}
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