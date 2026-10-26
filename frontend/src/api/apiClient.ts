/**
 * すべてのAPI呼び出しで共通の処理を行うfetchのラッパー。
 *
 * - 状態を変更するリクエストに、CookieのCSRFトークンと送信時点のユーザーIDをヘッダーとして付ける。
 * - CSRFトークンが無効だった場合は、トークンだけを取り直す(元のリクエストは再送しない)。
 * - ログインが必要(401 UNAUTHORIZED)な応答を受けたら、登録されたハンドラーに知らせる。
 * - 送信後に認証状態(ログイン・ログアウト・アカウント切り替え)が変わったリクエストは、
 *   中断してAuthContextChangedErrorを投げ、応答を呼び出し元に渡さない。
 *
 * 応答はfetchと同じResponseをそのまま返すため、エラーの解析は各API関数で行う。
 */

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

// サーバーがセッションのユーザーと照合し、別のユーザーに切り替わっていれば処理しない。
// 認証には使わない(認証と所有者の判定は常にサーバーのセッションで行う)。
const EXPECTED_USER_HEADER = 'X-Expected-User-Id';

// サーバーがCSRFトークンを検証しないメソッド。
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

// ログイン前でもCSRFトークンのCookieを発行してもらえるGETのAPI。
const CSRF_REFRESH_URL = '/api/auth/me';

// ヘッダーにトークンを追加しやすいよう、オブジェクト形式のヘッダーだけを受け付ける。
export type ApiRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  // falseにすると、401 UNAUTHORIZEDでもハンドラーに知らせない。
  // ログイン状態の確認のように、401が「未ログイン」という想定内の結果である場合に使う。
  notifyUnauthorized?: boolean;
};

// fetchに渡すリクエストの設定(apiFetch独自のオプションを除いたもの)。
type FetchRequestInit = Omit<ApiRequestInit, 'notifyUnauthorized'>;

/**
 * リクエストの送信後に認証状態が変わったため、そのリクエストを中断したことを表す。
 * 新しい認証状態の画面ではエラーとして表示する必要はない。
 */
export class AuthContextChangedError extends Error {
  constructor() {
    super('로그인 상태가 바뀌어 요청을 중단했습니다.');
    this.name = 'AuthContextChangedError';
  }
}

type AuthContext = {
  // 認証状態が変わるたびに新しく作る。同じ値の間に送ったリクエストは同じ認証状態に属する。
  readonly epoch: string;
  readonly userId: number | null;
  // この認証状態の間に送ったリクエストを、認証状態が変わったときにまとめて中断する。
  readonly controller: AbortController;
};

// 認証状態ごとに重ならない値を作る。他のタブとも比較するため、時刻と乱数を組み合わせる。
// crypto.randomUUIDはHTTPS・localhost以外では使えないため、HTTPでも使えるgetRandomValuesを使う。
function createEpoch(): string {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${high.toString(36)}${low.toString(36)}`;
}

function createAuthContext(userId: number | null): AuthContext {
  return {
    epoch: createEpoch(),
    userId,
    controller: new AbortController(),
  };
}

let currentAuth: AuthContext = createAuthContext(null);

/**
 * ログイン・ログアウト・アカウント切り替えの開始時と完了時に呼ぶ。
 * それまでに送ったリクエストは中断され、応答が届いても呼び出し元に渡らない。
 * userIdは確定したログイン中のユーザー(未ログイン・確認中はnull)。
 */
export function switchAuthContext(userId: number | null): void {
  const previous = currentAuth;
  currentAuth = createAuthContext(userId);
  previous.controller.abort(new AuthContextChangedError());
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * 401 UNAUTHORIZEDを受けたときに呼ぶハンドラーを登録する。
 * 戻り値の関数を呼ぶと登録を解除する(ReactのuseEffectの後片付けで使う)。
 */
export function setUnauthorizedHandler(
  handler: UnauthorizedHandler,
): () => void {
  unauthorizedHandler = handler;

  return () => {
    // 後から別のハンドラーが登録されていた場合は、そちらを消さない。
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

function readCookie(name: string): string | null {
  for (const cookie of document.cookie.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function buildRequest(init: FetchRequestInit, auth: AuthContext): RequestInit {
  // 呼び出し元の中断と、認証状態の変更による中断のどちらでも止まるようにする。
  const signal = init.signal
    ? AbortSignal.any([init.signal, auth.controller.signal])
    : auth.controller.signal;
  const method = (init.method ?? 'GET').toUpperCase();

  if (SAFE_METHODS.has(method)) {
    return { ...init, signal };
  }

  const headers = { ...init.headers };

  // ログイン時にトークンが再発行されるため、保存した値ではなく毎回Cookieから読む。
  const token = readCookie(CSRF_COOKIE);
  if (token) {
    headers[CSRF_HEADER] = token;
  }

  if (auth.userId !== null) {
    headers[EXPECTED_USER_HEADER] = String(auth.userId);
  }

  return { ...init, headers, signal };
}

// エラー応答のcodeを、呼び出し元が本文を読めるよう複製から読み取る。
async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();

    if (typeof body === 'object' && body !== null && 'code' in body) {
      return typeof body.code === 'string' ? body.code : undefined;
    }
  } catch {
    // JSONでない本文やキャンセルは、呼び出し元の通常のエラー処理に任せる。
  }
  return undefined;
}

async function refreshCsrfToken(signal: AbortSignal): Promise<void> {
  // 応答の内容は使わない。401でもトークンのCookieは発行される。
  await fetch(CSRF_REFRESH_URL, { signal });
}

export async function apiFetch(
  url: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  // 独自のオプションはfetchに渡さない。
  const { notifyUnauthorized = true, ...requestInit } = init;

  // 送信時点の認証状態に、このリクエストを結び付ける。
  const auth = currentAuth;
  const isStale = () => auth.epoch !== currentAuth.epoch;

  let response: Response;
  try {
    response = await fetch(url, buildRequest(requestInit, auth));
  } catch (error) {
    // 認証状態の変更による中断は、呼び出し元の中断やネットワークエラーと区別する。
    if (isStale()) {
      throw new AuthContextChangedError();
    }
    throw error;
  }

  // 元のリクエストは再送しない。待機中に別のタブでアカウントが切り替わると、
  // 前のユーザーの内容が新しいユーザーとして保存されるおそれがあるため。
  // 次にユーザーが操作したときに使えるよう、トークンだけを取り直す。
  if (
    response.status === 403 &&
    (await readErrorCode(response)) === 'CSRF_TOKEN_INVALID'
  ) {
    await refreshCsrfToken(auth.controller.signal).catch(() => {
      // 取り直しに失敗しても、元の403をそのまま返す。
    });
  }

  // ログイン失敗(INVALID_CREDENTIALS)も401のため、codeで区別する。
  const isUnauthorized =
    response.status === 401 &&
    (await readErrorCode(response)) === 'UNAUTHORIZED';

  // 中断に応じずに届いた応答や、上の非同期処理の間に認証状態が変わった応答は、
  // 前の認証状態のものなので呼び出し元に渡さない。
  // 先に届いた401のハンドラーが認証状態を切り替えた後は、残りの401は通知しない。
  if (isStale()) {
    throw new AuthContextChangedError();
  }

  if (isUnauthorized && notifyUnauthorized) {
    unauthorizedHandler?.();
  }

  return response;
}
