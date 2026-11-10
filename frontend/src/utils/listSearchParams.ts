import type {
  DeadlineFilter,
  JobPostingSorting,
  SalaryFilter,
  StatusFilter,
} from '../types/jobPosting';
import { SALARY_OPTIONS } from '../constants/salaryOptions';

/**
 * 一覧の検索条件とURLのクエリの変換。
 *
 * 適用中の検索条件はURLだけに持つ。戻る・進む操作や詳細画面から戻ったときも、
 * URLから同じ条件を読み直せるようにするため。
 * URLは手で書き換えたり、他人から受け取ったリンクで開いたりできるため、
 * 画面の選択肢で表せない値は使わない。使わない値があってもURLは書き換えない。
 */

// 求人情報一覧の既定の並び順。URLでは省略する。
export const DEFAULT_SORTING: JobPostingSorting = 'createdAt,desc';

const SORTINGS: readonly JobPostingSorting[] = ['createdAt,desc', 'createdAt,asc', 'companyName,asc'];

export type ListConditions = {
  keyword: string;
  status: StatusFilter;
  salaryMin: SalaryFilter;
  salaryMax: SalaryFilter;
  deadlineFrom: DeadlineFilter;
  deadlineTo: DeadlineFilter;
  sorting: JobPostingSorting;
};

// URLのstatusを有効なStatusFilterに変換する。
function parseStatusFilter(value: string | null): StatusFilter {
  switch (value) {
    case 'SAVED':
    case 'APPLIED':
    case 'INTERVIEWING':
    case 'OFFERED':
    case 'REJECTED':
      return value;

    default:
      return '';
  }
}

// URLのpageを0以上の整数に変換する。不正な値の場合は1ページ目(0)を使用する。
export function parsePage(value: string | null): number {
  if (value === null) {
    return 0;
  }

  const page = Number(value);

  if (!Number.isInteger(page) || page < 0) {
    return 0;
  }

  return page;
}

// 選択肢にない月給は、selectで表示できず画面と取得条件がずれるため使わない。
function parseSalary(value: string | null): SalaryFilter {
  if (value === null) {
    return null;
  }

  const salary = Number(value);
  return SALARY_OPTIONS.includes(salary) ? salary : null;
}

// YYYY-MM-DD形式で、実在する日付だけを使う。
// 2026-02-30のような日付はDateが繰り上げ、形式の違う日付は無効か別の文字列になるため、YYYY-MM-DDに戻して比べる。
function parseDeadline(value: string | null): DeadlineFilter {
  if (value === null) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function parseSorting(value: string | null): JobPostingSorting {
  return SORTINGS.find((sorting) => sorting === value) ?? DEFAULT_SORTING;
}

// URLのクエリから検索条件を読む。逆の範囲はサーバーが拒否するため、両方とも使わない。
export function listConditionsFrom(searchParams: URLSearchParams): ListConditions {
  let salaryMin = parseSalary(searchParams.get('salaryMin'));
  let salaryMax = parseSalary(searchParams.get('salaryMax'));
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    salaryMin = null;
    salaryMax = null;
  }

  let deadlineFrom = parseDeadline(searchParams.get('deadlineFrom'));
  let deadlineTo = parseDeadline(searchParams.get('deadlineTo'));
  // YYYY-MM-DD形式のため、文字列のまま日付の前後を比較できる。
  if (deadlineFrom !== null && deadlineTo !== null && deadlineFrom > deadlineTo) {
    deadlineFrom = null;
    deadlineTo = null;
  }

  return {
    keyword: searchParams.get('keyword') ?? '',
    status: parseStatusFilter(searchParams.get('status')),
    salaryMin,
    salaryMax,
    deadlineFrom,
    deadlineTo,
    sorting: parseSorting(searchParams.get('sort')),
  };
}

// 詳細条件(月給・締切日・並び順)が既定値以外か。詳細条件の欄を開いて見せるかの判断に使う。
export function hasAdvancedConditions(conditions: ListConditions): boolean {
  return conditions.salaryMin !== null
    || conditions.salaryMax !== null
    || conditions.deadlineFrom !== null
    || conditions.deadlineTo !== null
    || conditions.sorting !== DEFAULT_SORTING;
}

// 検索条件からURLのクエリを作る。既定値と指定のない条件は省き、pageは1ページ目として含めない。
export function searchParamsOf(conditions: ListConditions): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (conditions.keyword !== '') {
    searchParams.set('keyword', conditions.keyword);
  }
  if (conditions.status !== '') {
    searchParams.set('status', conditions.status);
  }
  if (conditions.salaryMin !== null) {
    searchParams.set('salaryMin', String(conditions.salaryMin));
  }
  if (conditions.salaryMax !== null) {
    searchParams.set('salaryMax', String(conditions.salaryMax));
  }
  if (conditions.deadlineFrom !== null) {
    searchParams.set('deadlineFrom', conditions.deadlineFrom);
  }
  if (conditions.deadlineTo !== null) {
    searchParams.set('deadlineTo', conditions.deadlineTo);
  }
  if (conditions.sorting !== DEFAULT_SORTING) {
    searchParams.set('sort', conditions.sorting);
  }

  return searchParams;
}
