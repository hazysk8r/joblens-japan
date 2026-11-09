/**
 * 作成中のメモをブラウザのタブに一時保存する。
 *
 * セッションが切れて登録できなかったり、詳細画面を離れたりしても入力を失わないようにする。
 * 他のタブとは共有しないsessionStorageを使い、キーにユーザーと求人を含めて混ざらないようにする。
 * ストレージを使えない環境では保存せず、入力はそのまま使える。
 */
const KEY_PREFIX = 'joblens.memo-draft.';
// 登録フォームの入力上限。古い値や書き換えられた値でも上限を超えないようにする。
const MAX_CONTENT_LENGTH = 250;

export function memoDraftKey(userId: number, jobPostingId: number): string {
  return `${KEY_PREFIX}${userId}.${jobPostingId}`;
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

// ログアウトやユーザーの切り替えで呼ぶ。共用のパソコンで次の利用者に残さないため。
export function clearAllMemoDrafts(): void {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(KEY_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // 使えない環境では何も保存されていない。
  }
}
