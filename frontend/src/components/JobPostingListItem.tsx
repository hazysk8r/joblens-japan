import type {
	ApplicationStatus,
	JobPosting,
	UpdateJobPostingRequest,
} from '../types/jobPosting';

import { useState, useEffect } from 'react';
import { formatDateTime } from '../utils/date';

import JobPostingMemoCreateForm from './JobPostingMemoCreateForm';
import JobPostingEditForm from './JobPostingEditForm';
import JobPostingMemoEditForm from './JobPostingMemoEditForm';
import { extractRequiredSkills } from '../api/jobPostingApi';
import { deleteJobPostingMemo, getJobPostingMemos, updateJobPostingMemo } from '../api/jobPostingMemoApi';
import type { JobPostingMemo, UpdateJobPostingMemoRequest } from '../types/jobPostingMemo';

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
	//메모
	const [memos, setMemos] = useState<JobPostingMemo[]>([]);
	const [memosError, setMemosError] = useState<string | null>(null);
	const [memosLoading, setMemosLoading] = useState(false);
	const [memoReloadKey, setMemoReloadKey] = useState(0);
	const [deletingMemoId, setDeletingMemoId] = useState<number | null>(null);
	const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
	const [savingMemoId, setSavingMemoId] = useState<number | null>(null);
	const [memoUpdateError, setMemoUpdateError] = useState<string | null>(null);
	const [memoVisible, setMemoVisible] = useState(false);
	const [memosLoaded, setMemosLoaded] = useState(false);

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

	function handleToggleMemo() {
		setMemoVisible(prev => !prev);
	}

	useEffect(() => {

		if (!memoVisible || memosLoaded) {
			return;
		}

		let cancelled = false; //値を変更する必要があるので、constではなくletを使います
		setMemosLoading(true)
		void getJobPostingMemos(jobPosting.id)
			.then((getMemos) => {
				if (!cancelled) {
					setMemos(getMemos);
					setMemosLoaded(true);
					setMemosError(null);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setMemos([]);

					setMemosError(
						error instanceof Error
							? error.message
							: '메모 조회에 실패하였습니다.',
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setMemosLoading(false);
				}
			});

		// useEffectのcleanup
		return () => {
			cancelled = true;
		};
	}, [jobPosting.id, memoReloadKey, memoVisible, memosLoaded]);

	function handleMemoCreated() {
		setMemosLoaded(false);
		setMemosLoading(true);
		setMemoVisible(true);
		setMemosError(null);
		setMemoReloadKey((key) => key + 1);
	}

	async function handleMemoDeletion(
		jobPostingMemo: JobPostingMemo,
	) {
		const confirmed = window.confirm(
			`メモを削除しますか？`,
		);

		if (!confirmed) {
			return;
		}

		setDeletingMemoId(jobPostingMemo.id);
		setMemosError(null);

		try {
			await deleteJobPostingMemo(jobPosting.id, jobPostingMemo.id);
			setMemosLoaded(false);
			setMemosLoading(true);
			setMemoReloadKey((key) => key + 1);
		} catch (caughtError) {
			const message =
				caughtError instanceof Error
					? caughtError.message
					: '삭제 중 알 수 없는 오류가 발생하였습니다.';
			setMemosError(message);
		} finally {
			setDeletingMemoId(null);
		}
	}

	function handleMemoEdit(
		jobPostingMemo: JobPostingMemo
	) {
		setEditingMemoId(jobPostingMemo.id);
		setMemoUpdateError(null);
	}

	function handleCancelMemoEdit() {
		setEditingMemoId(null);
		setMemoUpdateError(null);
	}

	async function handleSaveMemoEdit(
		jobPostingId: number,
		memoId: number,
		request: UpdateJobPostingMemoRequest
	) {
		setSavingMemoId(memoId);
		setMemosError(null);
		setMemoUpdateError(null);

		try {
			await updateJobPostingMemo(jobPostingId, memoId, request);
			setMemosLoaded(false);
			setMemosLoading(true);
			setEditingMemoId(null); // 수정 성공했을 때만 실행
			setMemoReloadKey((previous) => previous + 1);
		} catch (caughtError) {
			const message =
				caughtError instanceof Error
					? caughtError.message
					: '수정 중 알 수 없는 오류가 발생하였습니다.';
			setMemoUpdateError(message);
		} finally {
			setSavingMemoId(null);
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

			<button type="button" onClick={handleToggleMemo}>
				{memoVisible ? '메모 닫기' : '메모 보기'}
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
						onCreated={handleMemoCreated}
					/>
					{memoVisible && (
						<>
							{memosLoading ? (
								<p>메모 불러오는 중...</p>
							) : memosError !== null ? (
								<p role="alert">{memosError}</p>
							) : memos.length > 0 ? (
								<ul>
									{memos.map((memo) => (
										<li key={memo.id}>
											{editingMemoId === memo.id ? (
												<>
													<JobPostingMemoEditForm
														jobPostingMemo={memo}
														jobPosting={jobPosting}
														saving={savingMemoId === memo.id}
														onSave={handleSaveMemoEdit}
														onCancel={handleCancelMemoEdit}
													/>

													{memoUpdateError !== null && (
														<p role="alert">
															{memoUpdateError}
														</p>
													)}
												</>
											) : (
												<>
													<span>{memo.content}</span>

													<p>
														更新日時: {formatDateTime(memo.updatedAt)}
													</p>

													<button
														type="button"
														onClick={() => handleMemoEdit(memo)}
														disabled={deletingMemoId === memo.id}
													>
														수정
													</button>

													<button
														type='button'
														onClick={() => {
															void handleMemoDeletion(memo);
														}}
														disabled={deletingMemoId === memo.id}
													>
														{deletingMemoId === memo.id
															? '메모 삭제 중...'
															: '메모 삭제'
														}
													</button>
												</>
											)}
										</li>
									))}
								</ul>
							) : (
								<p>등록된 메모가 없습니다.</p>
							)}
						</>
					)}
				</>
			)}
		</li>
	);
}

export default JobPostingListItem;