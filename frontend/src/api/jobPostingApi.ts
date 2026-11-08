import type {
  CreateJobPostingRequest,
  UpdateJobPostingRequest,
  JobPosting,
  PageResponse,
  UpdateApplicationStatusRequest,
  ApplicationStatusSummaryResponse,
  JobPostingStatusHistory,
  JobPostingAnalysis,
  StatusFilter,
  SalaryFilter,
  JobPostingSorting,
  DeadlineFilter,
} from '../types/jobPosting';

import { apiFetch } from './apiClient';
import { parseApiError } from './apiError';

/**
 * バックエンドの求人一覧APIを呼び出す。
 *
 * keywordが空の場合は全件を取得し、
 * 値がある場合はそのキーワードで検索する。
 */
export async function fetchJobPostings(
  keyword: string,
  status: StatusFilter,
  page: number,
  sort: JobPostingSorting,
  salaryMin: SalaryFilter,
  salaryMax: SalaryFilter,
  deadlineFrom: DeadlineFilter,
  deadlineTo: DeadlineFilter,
): Promise<PageResponse<JobPosting>> {
  const params = new URLSearchParams({
    /*
     * Reactが管理している現在のページ番号をAPIに渡す。
     * バックエンドのページ番号は0から始まる。
     */
    page: page.toString(),
    size: '5',
    sort,

  });

  const normalizedKeyword = keyword.trim();

  if (normalizedKeyword) {
    params.set('keyword', normalizedKeyword);
  }

  if (status !== '') {
    params.set('status', status);
  }

  if (salaryMin !== null) {
    params.set("salaryMin", String(salaryMin));
  }

  if (salaryMax !== null) {
    params.set("salaryMax", String(salaryMax));
  }

  if (deadlineFrom) {
    params.set("deadlineFrom", deadlineFrom);
  }

  if (deadlineTo) {
    params.set("deadlineTo", deadlineTo);
  }


  const response = await apiFetch(
    `/api/job-postings?${params.toString()}`,
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人の取得に失敗しました。',
    );
  }

  return (await response.json()) as PageResponse<JobPosting>;
}

/**
 * 指定したIDの求人を1件取得する。
 * 他のユーザーの求人は、存在しない求人と同じく404になる。
 */
export async function fetchJobPosting(
  id: number,
  signal: AbortSignal,
): Promise<JobPosting> {
  const response = await apiFetch(
    `/api/job-postings/${id}`,
    {
      signal,
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人の取得に失敗しました。',
    );
  }

  return (await response.json()) as JobPosting;
}

/**
 * 新しい求人をバックエンドに登録する。
 */
export async function createJobPosting(
  request:CreateJobPostingRequest,
): Promise<JobPosting> {
  const response = await apiFetch('/api/job-postings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    /*
     * JavaScriptのオブジェクトをHTTPリクエストの本文として送るため、
     * JSON文字列に変換する。
     */
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人の登録に失敗しました。',
    );
  }

  return (await response.json()) as JobPosting;
}

/**
 * 指定したIDの求人を削除する。
 */
export async function deleteJobPosting(
  id: number,
): Promise<void> {
  const response = await apiFetch(
    `/api/job-postings/${id}`,
    {
      method: 'DELETE',
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人の削除に失敗しました。',
    );
  }

  /*
   * 削除成功の応答は204 No Contentのため、
   * response.json()を呼び出さない。
   */
}

export async function updateJobPosting(
  id: number,
  request: UpdateJobPostingRequest,
  expectedVersion: number
): Promise<JobPosting> {
  const response = await apiFetch(
    `/api/job-postings/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${expectedVersion}"`,
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人の編集に失敗しました。',
    );
  }

  return (await response.json()) as JobPosting;
}

export async function updateApplicationStatus(
  id: number,
  request: UpdateApplicationStatusRequest,
  expectedVersion: number
): Promise<JobPosting> {
  const response = await apiFetch(
    `/api/job-postings/${id}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': `"${expectedVersion}"`,
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '応募ステータスの変更に失敗しました。',
    );
  }

  return (await response.json()) as JobPosting;
}

export async function fetchApplicationStatusSummary(
): Promise<ApplicationStatusSummaryResponse> {
  const response = await apiFetch(
    `/api/job-postings/status-summary`,
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '応募状況の取得に失敗しました。',
    );
  }

  return (await response.json()) as ApplicationStatusSummaryResponse;
}

export async function fetchApplicationStatusHistory(
  id: number,
): Promise<JobPostingStatusHistory[]> {
  const response = await apiFetch(
    `/api/job-postings/${id}/status-history`
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '変更履歴の取得に失敗しました。',
    );
  }

  return (await response.json()) as JobPostingStatusHistory[];
}

/**
 * 求人票の原文を分析した結果(固定残業代の判定と技術スタック)を取得する。
 * 結果は保存されず、呼び出すたびに現在の原文から分析される。
 */
export async function fetchJobPostingAnalysis(
  id: number,
  signal: AbortSignal,
): Promise<JobPostingAnalysis> {
  const response = await apiFetch(
    `/api/job-postings/${id}/analysis`,
    {
      signal,
    },
  );

  if (!response.ok) {
    throw await parseApiError(
      response,
      '求人票の分析に失敗しました。',
    );
  }

  return (await response.json()) as JobPostingAnalysis;
}

