import { SALARY_OPTIONS } from '../constants/salaryOptions';
import { POSTING_DRAFT_PREFIX, POSTING_EDIT_DRAFT_PREFIX } from './draftStorage';
import type { JobPosting } from '../types/jobPosting';

/**
 * 求人登録フォームの入力途中の内容を一時保存する。
 *
 * セッションが切れて登録できなかったり、登録画面を離れたりしても、貼り付けた求人票を失わないようにする。
 * ストレージを使えない環境や容量を超えた場合は保存せず、入力はそのまま使える。
 */
export type PostingDraft = {
  companyName: string;
  title: string;
  sourceUrl: string;
  originalText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  applicationDeadline: string;
};

export const EMPTY_POSTING_DRAFT: PostingDraft = {
  companyName: '',
  title: '',
  sourceUrl: '',
  originalText: '',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: '',
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function postingDraftKey(userId: number): string {
  return `${POSTING_DRAFT_PREFIX}${userId}`;
}

function isEmpty(draft: PostingDraft): boolean {
  return draft.companyName === ''
    && draft.title === ''
    && draft.sourceUrl === ''
    && draft.originalText === ''
    && draft.salaryMin === null
    && draft.salaryMax === null
    && draft.applicationDeadline === '';
}

// 選択肢にない値は選択欄に表示できず、画面と送信内容が食い違うため、指定なしにする。
function salaryOf(value: unknown): number | null {
  return typeof value === 'number' && SALARY_OPTIONS.includes(value) ? value : null;
}

// 保存された値をJSONとして読む。読めない場合はnull。
function readJson(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * 求人の入力値として正しい形かを確かめ、選択肢に合わせて整える。正しくない場合はnullを返す。
 * ストレージの値は以前のバージョンや他のコードが書いた可能性があるため、型を信用せずに検証する。
 * 文字数の上限を超えた値は切り詰めない。切り詰めた原文がそのまま登録されると、利用者も分析も末尾の欠けに気付けないため。
 * 超えていることは文字数の表示とサーバーの検証で伝える。
 */
function parsePostingValues(value: unknown): PostingDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { companyName, title, sourceUrl, originalText, applicationDeadline } = record;
  if (
    typeof companyName !== 'string'
    || typeof title !== 'string'
    || typeof sourceUrl !== 'string'
    || typeof originalText !== 'string'
  ) {
    return null;
  }

  return {
    companyName,
    title,
    sourceUrl,
    originalText,
    salaryMin: salaryOf(record.salaryMin),
    salaryMax: salaryOf(record.salaryMax),
    applicationDeadline:
      typeof applicationDeadline === 'string' && DATE_PATTERN.test(applicationDeadline)
        ? applicationDeadline
        : '',
  };
}

/** 保存された内容を読み取る。保存されていない場合や形が正しくない場合はnullを返す。 */
export function readPostingDraft(key: string): PostingDraft | null {
  const draft = parsePostingValues(readJson(key));
  return draft === null || isEmpty(draft) ? null : draft;
}

export function writePostingDraft(key: string, draft: PostingDraft): void {
  try {
    if (isEmpty(draft)) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(draft));
    }
  } catch {
    // 保存できなくても、入力はそのまま使える。
  }
}

export function removePostingDraft(key: string): void {
  writePostingDraft(key, EMPTY_POSTING_DRAFT);
}

// ---- 登録済みの求人の編集 ----

/**
 * 編集の一時保存。編集を始めたときのversionも持ち、保存のときにそのversionで送る。
 * 一時保存の後に別の画面で変更されていれば、上書きせずに競合として扱うため。
 */
export type PostingEditDraft = {
  baseVersion: number;
  values: PostingDraft;
};

export function postingEditDraftKey(userId: number, jobPostingId: number): string {
  return `${POSTING_EDIT_DRAFT_PREFIX}${userId}.${jobPostingId}`;
}

// 求人をフォームの入力値の形にする。
export function postingValuesOf(jobPosting: JobPosting): PostingDraft {
  return {
    companyName: jobPosting.companyName ?? '',
    title: jobPosting.title,
    sourceUrl: jobPosting.sourceUrl ?? '',
    originalText: jobPosting.originalText,
    salaryMin: jobPosting.salaryMin,
    salaryMax: jobPosting.salaryMax,
    applicationDeadline: jobPosting.applicationDeadline ?? '',
  };
}

export function samePostingValues(a: PostingDraft, b: PostingDraft): boolean {
  return a.companyName === b.companyName
    && a.title === b.title
    && a.sourceUrl === b.sourceUrl
    && a.originalText === b.originalText
    && a.salaryMin === b.salaryMin
    && a.salaryMax === b.salaryMax
    && a.applicationDeadline === b.applicationDeadline;
}

export function readPostingEditDraft(key: string): PostingEditDraft | null {
  const value = readJson(key);
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { baseVersion, values } = value as Record<string, unknown>;
  // versionはサーバーへそのまま送るため、0以上の正確に表せる整数だけを受け付ける。
  if (typeof baseVersion !== 'number' || !Number.isSafeInteger(baseVersion) || baseVersion < 0) {
    return null;
  }
  const parsed = parsePostingValues(values);
  return parsed === null ? null : { baseVersion, values: parsed };
}

export function writePostingEditDraft(key: string, draft: PostingEditDraft): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 保存できなくても、入力はそのまま使える。
  }
}
