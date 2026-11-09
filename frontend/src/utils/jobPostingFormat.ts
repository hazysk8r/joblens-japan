import type { ApplicationStatus } from '../types/jobPosting';

// ApplicationStatusの全ての値に対応する画面表示用の日本語ラベルを定義する。
export const APPLICATION_STATUS_LABELS:
  Record<ApplicationStatus, string> = {
  SAVED: '保存済み',
  APPLIED: '応募済み',
  INTERVIEWING: '面接中',
  OFFERED: '内定',
  REJECTED: '不採用',
};

// 選択欄に表示する順番。
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'SAVED',
  'APPLIED',
  'INTERVIEWING',
  'OFFERED',
  'REJECTED',
];

// 給与の範囲を、登録されている値に合わせた文言にする。
export function formatSalaryRange(
  salaryMin: number | null,
  salaryMax: number | null,
): string {
  if (salaryMin !== null && salaryMax !== null) {
    return `${salaryMin.toLocaleString('ja-JP')}円 ～ ${salaryMax.toLocaleString('ja-JP')}円`;
  }
  if (salaryMin !== null) {
    return `${salaryMin.toLocaleString('ja-JP')}円以上`;
  }
  if (salaryMax !== null) {
    return `${salaryMax.toLocaleString('ja-JP')}円以下`;
  }
  return '給与未登録';
}
