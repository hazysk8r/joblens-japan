/**
 * 入力途中の内容をブラウザのタブに一時保存するときの共通部分。
 *
 * 他のタブとは共有しないsessionStorageを使う。キーにはユーザーを含め、他のユーザーの内容と混ざらないようにする。
 */
export const MEMO_DRAFT_PREFIX = 'joblens.memo-draft.';
export const POSTING_DRAFT_PREFIX = 'joblens.posting-draft.';
export const POSTING_EDIT_DRAFT_PREFIX = 'joblens.posting-edit-draft.';

const DRAFT_PREFIXES = [MEMO_DRAFT_PREFIX, POSTING_DRAFT_PREFIX, POSTING_EDIT_DRAFT_PREFIX];

// 1件の一時保存を消す。ストレージを使えない環境では何も保存されていない。
export function removeDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // 使えない環境では何も保存されていない。
  }
}

// ログアウトやユーザーの切り替えで呼ぶ。共用のパソコンで次の利用者に残さないため。
export function clearAllDrafts(): void {
  try {
    Object.keys(sessionStorage)
      .filter((key) => DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // 使えない環境では何も保存されていない。
  }
}
