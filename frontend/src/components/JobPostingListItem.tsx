import type {
	ApplicationStatus,
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import { useState } from 'react';
import { formatDateTime } from '../utils/date';

import JobPostingMemoCreateForm from './JobPostingMemoCreateForm';
import JobPostingEditForm from './JobPostingEditForm';
import JobPostingMemoEditForm from './JobPostingMemoEditForm';

import { extractRequiredSkills } from '../api/jobPostingApi';
import { useJobPostingMemos } from '../hooks/useJobPostingMemos';

interface JobPostingListItemProps {
	jobPosting: JobPosting;
	isEditing: boolean;
	isSaving: boolean;
	isDeleting: boolean;
	isUpdatingStatus: boolean;

	onStartEdit: (jobPosting: JobPosting) => void;
	onSave: (
		id: number,
		request: UpdateJobPostingRequest,
	) => Promise<void>;
	onCancel: () => void;
	onDelete: (jobPosting: JobPosting) => Promise<void>;
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

	// Memoの表示・非表示はView側で管理する
	const [memoVisible, setMemoVisible] = useState(false);

	const {
		memos,
		memosError,
		memosLoading,
		deletingMemoId,
		editingMemoId,
		savingMemoId,
		memoUpdateError,
		loadMemos,
		handleMemoCreated,
		startMemoEdit,
		cancelMemoEdit,
		saveMemoEdit,
		deleteMemo,
	} = useJobPostingMemos(jobPosting.id);

	async function handlePostingSkill() {
		if (skills !== null) {
			setSkillsVisible(
				previous => !previous,
			);
			return;
		}

		setLoading(true);

		try {
			setSkillsError(null);

			const extractedSkills =
				await extractRequiredSkills(
					jobPosting.id,
				);

			setSkills(extractedSkills);
			setSkillsVisible(true);
		} catch (error) {
			setSkills(null);
			setSkillsVisible(false);

			if (error instanceof Error) {
				setSkillsError(error.message);
			} else {
				setSkillsError(
					'기술 스택 조회에 실패하였습니다.',
				);
			}
		} finally {
			setLoading(false);
		}
	}

	function handleToggleMemo() {
		if (memoVisible) {
			setMemoVisible(false);
			return;
		}

		setMemoVisible(true);
		void loadMemos();
	}

	/*
	 * Memo作成成功時、
	 * View側ではMemo領域を表示し、
	 * Hook側ではCacheを無効化して再取得する。
	 */
	function handleCreated() {
		setMemoVisible(true);
		void handleMemoCreated();
	}

	/*
	 * 削除確認はUIの責任なのでComponent側で行う。
	 * 実際のDELETE処理はHookへ委譲する。
	 */
	async function handleMemoDeletion(
		memoId: number,
	) {
		const confirmed =
			window.confirm(
				'メモを削除しますか？',
			);

		if (!confirmed) {
			return;
		}

		await deleteMemo(memoId);
	}

	return (
		<li>
			<button
				type="button"
				disabled={loading}
				onClick={() => {
					void handlePostingSkill();
				}}
			>
				{loading
					? '처리중...'
					: '기술 스택 보기'}
			</button>

			<button
				type="button"
				onClick={handleToggleMemo}
				aria-expanded={memoVisible}
				aria-controls={
					`job-posting-memos-${jobPosting.id}`
				}
			>
				{memoVisible
					? '메모 닫기'
					: '메모 보기'}
			</button>

			{skills !== null &&
				skillsVisible && (
					skills.length > 0 ? (
						<ul>
							{skills.map(
								(skill) => (
									<li key={skill}>
										{skill}
									</li>
								),
							)}
						</ul>
					) : (
						<p>
							추출된 기술 스택이 없습니다.
						</p>
					)
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
								href={
									jobPosting.sourceUrl
								}
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
								value={
									jobPosting.applicationStatus
								}
								disabled={
									isUpdatingStatus
								}
								onChange={(event) => {
									void onApplicationStatusChange(
										jobPosting.id,
										event.target
											.value as ApplicationStatus,
									);
								}}
							>
								<option value="SAVED">
									저장
								</option>

								<option value="APPLIED">
									지원완료
								</option>

								<option value="INTERVIEWING">
									면접 진행 중
								</option>

								<option value="OFFERED">
									오퍼수령
								</option>

								<option value="REJECTED">
									거절됨
								</option>
							</select>
						</label>

						{isUpdatingStatus && (
							<span>
								상태 변경 중...
							</span>
						)}
					</p>

					<button
						type="button"
						onClick={() =>
							onStartEdit(
								jobPosting,
							)
						}
						disabled={isDeleting}
					>
						수정
					</button>

					<button
						type="button"
						onClick={() => {
							void onDelete(
								jobPosting,
							);
						}}
						disabled={isDeleting}
					>
						{isDeleting
							? '삭제 중...'
							: '삭제'}
					</button>

					<JobPostingMemoCreateForm
						jobPostingId={
							jobPosting.id
						}
						onCreated={handleCreated}
					/>

					<div
						id={
							`job-posting-memos-${jobPosting.id}`
						}
						hidden={!memoVisible}
					>
						{memosLoading ? (
							<p>
								메모 불러오는 중...
							</p>
						) : memosError !== null ? (
							<p role="alert">
								{memosError}
							</p>
						) : memos.length > 0 ? (
							<ul>
								{memos.map(
									(memo) => (
										<li key={memo.id}>
											{editingMemoId ===
												memo.id ? (
												<>
													<JobPostingMemoEditForm
														jobPostingMemo={
															memo
														}
														saving={
															savingMemoId ===
															memo.id
														}
														onSave={(
															request,
														) =>
															saveMemoEdit(
																memo.id,
																request,
															)
														}
														onCancel={
															cancelMemoEdit
														}
													/>

													{memoUpdateError !==
														null && (
															<p role="alert">
																{
																	memoUpdateError
																}
															</p>
														)}
												</>
											) : (
												<>
													<span>
														{
															memo.content
														}
													</span>

													<p>
														更新日時:{' '}
														{formatDateTime(
															memo.updatedAt,
														)}
													</p>

													<button
														type="button"
														onClick={() =>
															startMemoEdit(
																memo.id,
															)
														}
														disabled={
															deletingMemoId ===
															memo.id
														}
													>
														수정
													</button>

													<button
														type="button"
														onClick={() => {
															void handleMemoDeletion(
																memo.id,
															);
														}}
														disabled={
															deletingMemoId ===
															memo.id
														}
													>
														{deletingMemoId ===
															memo.id
															? '메모 삭제 중...'
															: '메모 삭제'}
													</button>
												</>
											)}
										</li>
									),
								)}
							</ul>
						) : (
							<p>
								등록된 메모가 없습니다.
							</p>
						)}
					</div>
				</>
			)}
		</li>
	);
}

export default JobPostingListItem;