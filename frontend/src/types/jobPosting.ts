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

// 一覧のバッジに使う固定残業代の判定。根拠の文は詳細画面で確認する。
export type FixedOvertimeSummary = {
  status: FixedOvertimeStatus;
  hours: number | null;
};

// 一覧の求人。fixedOvertimeは、サーバーでその求人の分析に失敗したときnull。
export interface ListedJobPosting extends JobPosting {
  fixedOvertime: FixedOvertimeSummary | null;
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
// 求人票の分析結果(GET /api/job-postings/{id}/analysis)
export type FixedOvertimeStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'NOT_MENTIONED'
  | 'UNDETERMINED';

// 判定の根拠となった原文の行。sectionは見出しより前の行ではnull。
// start・endは原文の中での行の位置(UTF-16の単位)。textが切り詰められていても、行全体を指す。
export type AnalysisEvidence = {
  section: string | null;
  text: string;
  start: number;
  end: number;
};

export type FixedOvertimeAnalysis = {
  status: FixedOvertimeStatus;
  // PRESENTで時間数を一つに特定できた場合だけ値を持つ。
  hours: number | null;
  // PRESENT以外ではnull。
  excessPayStated: boolean | null;
  evidence: AnalysisEvidence[];
};

/**
 * 技術の判定。「必須」「歓迎」は求人票にその表示があるときだけ。
 * IN_REQUIREMENTSは応募資格に書かれているが表示がないもの、UNDETERMINEDは表示が矛盾しているもの、
 * MENTIONEDは仕事内容・開発環境・研修など要件の外に書かれたもの(「不問」などの否定も含む)。
 */
export type SkillLevel = 'REQUIRED' | 'PREFERRED' | 'IN_REQUIREMENTS' | 'UNDETERMINED' | 'MENTIONED';

export type SkillAnalysis = {
  name: string;
  level: SkillLevel;
  // 「JavaまたはPython」「いずれか」のように一緒に書かれた、ほかの技術。
  alternatives: string[];
  // 判定の根拠の行。判定できずのときは、必須の行と否定の行の2つ。
  evidence: AnalysisEvidence[];
};

export type JobPostingAnalysis = {
  fixedOvertime: FixedOvertimeAnalysis;
  skills: SkillAnalysis[];
};
