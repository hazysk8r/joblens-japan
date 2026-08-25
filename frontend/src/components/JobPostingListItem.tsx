import type {
	ApplicationStatus,
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import { useState } from 'react';

import JobPostingMemoCreateForm from './JobPostingMemoCreateForm';
import JobPostingEditForm from './JobPostingEditForm';
import { extractRequiredSkills } from '../api/jobPostingApi';

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
	const [skills, setSkills] = useState<string[] | null>(null);
	const [skillsError, setSkillsError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [skillsVisible, setSkillsVisible] = useState(false);
	async function handlePostingSkill() {
		// 데이터가 이미 들어있는 지 확인 (Early return)
		if (skills !== null) {
			setSkillsVisible(skillsVisible => !skillsVisible);
			return;
		}
		// 요청 시작 상태로 변경하는 단계
		setLoading(true);
		try {
			setSkillsError(null);
			const extractedSkills = await extractRequiredSkills(jobPosting.id);
			setSkills(extractedSkills);
			setSkillsVisible(true);
		} catch (error) {
			setSkills(null);
			setSkillsVisible(false);

			if (error instanceof Error) {
				setSkillsError(error.message);
			} else {
				setSkillsError('기술 스택 조회에 실패하였습니다.');
			}
		// 성공/실패 관계없이 요청 종료 상태로 복원
		} finally {
			setLoading(false);
		}
	}
	return (
		<li>
			<button
				type='button'
				disabled={loading}
				onClick={() => {
					void handlePostingSkill();
				}}
			>
				{loading ? '처리중...' : '기술 스택 보기'}
			</button>
			{skills !== null && skillsVisible && (
				skills.length > 0
					? <ul>
						{skills.map((skill) => (
							<li key={skill}>
								{skill}
							</li>
						))}
						</ul>
					: <p>추출된 기술 스택이 없습니다.</p>
			)}
			{skillsError !== null && (
				<p role="alert">
					{skillsError}
				</p>
			)}
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

					<JobPostingMemoCreateForm
						jobPostingId={jobPosting.id}
					/>
				</>
			)}
		</li>
	);
}

export default JobPostingListItem;