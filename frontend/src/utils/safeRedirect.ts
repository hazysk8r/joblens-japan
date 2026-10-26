/**
 * ログイン後に戻る画面の経路を、ナビゲーションのstate(history.state)で受け渡す。
 *
 * stateはブラウザの履歴に保存された値で、以前のバージョンのアプリや同じオリジンの別のコードが
 * 残した値の可能性もあるため、型を信用せずに検証してから使う。
 * サイトの外や、ログイン画面自体へは戻さない。
 */

const DEFAULT_PATH = '/';
const LOGIN_PATH = '/login';

type LocationLike = {
  pathname: string;
  search: string;
  hash: string;
};

// ログイン画面へ移動するときに渡すstateを作る。
export function loginRedirectState(location: LocationLike): { from: string } {
  return { from: location.pathname + location.search + location.hash };
}

function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

// stateから戻り先を読み取る。検証できない場合はトップ画面を返す。
export function redirectPathFromState(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return DEFAULT_PATH;
  }

  const { from } = state;
  if (typeof from !== 'string' || !from.startsWith('/')) {
    return DEFAULT_PATH;
  }

  // URLとして解釈し、オリジンで判定する。
  // 「//evil.com」や「/\evil.com」(\は/として解釈される)のような値は別のオリジンになる。
  const origin = window.location.origin;
  let url: URL;
  try {
    url = new URL(from, origin);
  } catch {
    return DEFAULT_PATH;
  }

  if (url.origin !== origin || isLoginPath(url.pathname)) {
    return DEFAULT_PATH;
  }

  return url.pathname + url.search + url.hash;
}
