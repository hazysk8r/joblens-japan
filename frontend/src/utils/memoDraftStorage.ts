import { MEMO_DRAFT_PREFIX } from './draftStorage';

/**
 * 作成中のメモをブラウザのタブに一時保存する。
 *
 * セッションが切れて登録できなかったり、詳細画面を離れたりしても入力を失わないようにする。
 * 他のタブとは共有しないsessionStorageを使い、キーにユーザーと求人を含めて混ざらないようにする。
 * ストレージを使えない環境では保存せず、入力はそのまま使える。
 */
// 登録フォームの入力上限。古い値や書き換えられた値でも上限を超えないようにする。
const MAX_CONTENT_LENGTH = 250;

export function memoDraftKey(userId: number, jobPostingId: number): string {
  return `${MEMO_DRAFT_PREFIX}${userId}.${jobPostingId}`;
}

export function readMemoDraft(key: string): string {
  try {
    return (sessionStorage.getItem(key) ?? '').slice(0, MAX_CONTENT_LENGTH);
  } catch {
    return '';
  }
}

export function writeMemoDraft(key: string, content: string): void {
  try {
    if (content === '') {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, content);
    }
  } catch {
    // 保存できなくても、入力はそのまま使える。
  }
}
