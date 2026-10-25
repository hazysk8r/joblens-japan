import type {
  CreateJobPostingMemoRequest,
  JobPostingMemo,
  UpdateJobPostingMemoRequest,
} from '../types/jobPostingMemo'

import { apiFetch } from './apiClient';
import { parseApiError } from './apiError';

export async function createJobPostingMemo(
  jobPostingId: number,
  request: CreateJobPostingMemoRequest,
): Promise<JobPostingMemo>  {
  const response = await apiFetch(`/api/job-postings/${jobPostingId}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await parseApiError(
      response,
      '메모 등록에 실패했습니다.',
    );
  }

  return (await response.json()) as JobPostingMemo;
}

export async function getJobPostingMemos(
  jobPostingId: number,
): Promise<JobPostingMemo[]> {


  const response = await apiFetch(
    `/api/job-postings/${jobPostingId}/notes`,
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '메모 내용 조회에 실패하였습니다.',
    );
  }

  return (await response.json()) as JobPostingMemo[];
}

export async function deleteJobPostingMemo(
  jobPostingId: number,
  memoId: number,
): Promise<void> {
  const response = await apiFetch(
    `/api/job-postings/${jobPostingId}/notes/${memoId}`,
    {
      method: 'DELETE'
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '메모 삭제에 실패하였습니다.',
    );
  }
}

export async function updateJobPostingMemo(
  jobPostingId: number,
  memoId: number,
  request: UpdateJobPostingMemoRequest,
): Promise<JobPostingMemo> {
  const response = await apiFetch(
    `/api/job-postings/${jobPostingId}/notes/${memoId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '메모 수정에 실패하였습니다.',
    );
  }

  return (await response.json()) as JobPostingMemo;
}