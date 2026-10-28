/**
 * 同じブラウザの他のタブに、ログイン状態が変わったことを知らせる。
 *
 * セッションCookieはすべてのタブで共有されるため、あるタブでログイン・ログアウトすると、
 * 他のタブの画面と実際のセッションが食い違う。localStorageへの書き込みは、
 * 同じサイトの他のタブにstorageイベントとして届く(書き込んだタブ自身には届かない)。
 *
 * localStorageは同じ端末の利用者が見られるため、ユーザーの情報は書かず、毎回変わる値だけを書く。
 * 受け取ったタブは、値の内容ではなく「変わった」ことだけを使い、サーバー(/me)に確認する。
 */

const AUTH_CHANGED_KEY = 'joblens.auth-changed';

function createNonce(): string {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${high.toString(36)}${low.toString(36)}`;
}

// このタブでのログイン・会員登録・ログアウトの成功後に呼ぶ。
export function notifyAuthChanged(): void {
  try {
    localStorage.setItem(AUTH_CHANGED_KEY, createNonce());
  } catch {
    // localStorageを使えない環境では通知しない。
    // その場合も、401・409を受けたときの再確認でセッションとの食い違いを直す。
  }
}

/**
 * 他のタブからの通知を受け取る。戻り値の関数を呼ぶと受け取りをやめる。
 */
export function subscribeAuthChanged(onChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    // 他のキーの変更や、キーの削除・localStorage.clear()(newValueがnull)は通知ではない。
    if (event.key !== AUTH_CHANGED_KEY || event.newValue === null) {
      return;
    }
    onChange();
  };

  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
