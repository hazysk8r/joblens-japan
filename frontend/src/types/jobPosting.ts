// Status(ApplicationStatus)の型を追加
export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'INTERVIEWING'
  | 'OFFERED'
  | 'REJECTED';

// ApplicationStatusまたは""(すべて)。不正なフィルターの入力を防ぐ
export type StatusFilter =
  ApplicationStatus | "";

export type DeadlineFilter =
  string | null;

export type JobPostingStatusHistory = {
  id: number;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  changedAt: string;
} 

export type JobPostingSorting =
  | 'createdAt,desc'
  | 'createdAt,asc'
  | 'companyName,asc';


// Status(ApplicationStatus)の集計
export interface ApplicationStatusSummaryResponse {
  saved: number;
  applied: number;
  interviewing: number;
  offered: number;
  rejected: number;
}

// SalaryFilterを追加
export type SalaryFilter = number | null;

// バックエンドのJSON応答の構造をTypeScriptで表現したもの
export interface JobPosting {
  id: number;
  companyName: string | null;
  title: string;
  sourceUrl: string | null;
  originalText: string;
  createdAt: string;
  applicationStatus: ApplicationStatus;
  salaryMin: number | null;
  salaryMax: number | null;
  applicationDeadline: string | null;
  version: number;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

/**
* 求人登録APIに渡すリクエストデータ。
*/
export interface CreateJobPostingRequest {
  companyName: string | null;
  title: string;
  sourceUrl: string | null;
  originalText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  applicationDeadline: string | null;
}

export interface UpdateJobPostingRequest {
  companyName: string | null;
  title: string;
  sourceUrl: string | null;
  originalText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  applicationDeadline: string | null;
}

export interface UpdateApplicationStatusRequest {
  status: ApplicationStatus;
}