import type { User } from '../types/auth';

import { apiFetch } from './apiClient';
import { parseApiError } from './apiError';

/*
 * 失敗の扱いは呼び出し元(AuthProvider)が判断する。ここではエラーの種類を区別できるように投げる。
 * - ApiError: サーバーが応答を返した。4xx(例: パスワード不一致)は処理されていないことが確実だが、
 *   5xxはサーバーで処理が終わった後にも起こり得る。
 * - それ以外: 応答を受け取れなかった、または読めなかった。サーバーで処理されたかは分からない。
 */

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    'email' in value &&
    typeof value.email === 'string'
  );
}

async function readUser(response: Response): Promise<User> {
  const body: unknown = await response.json();

  if (!isUser(body)) {
    // 成功応答なのに形式が違う場合は、サーバーの処理結果が分からないものとして扱う。
    throw new Error('서버 응답을 확인할 수 없습니다.');
  }
  return body;
}

/**
 * 現在ログインしているユーザーを取得する。
 * 未ログイン(401)はエラーではなくnullを返す。サーバー障害や通信エラーは例外を投げる。
 */
export async function fetchMe(): Promise<User | null> {
  // 未ログインの401は想定内のため、セッション切れとして通知しない。
  const response = await apiFetch('/api/auth/me', {
    notifyUnauthorized: false,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw await parseApiError(
      response,
      '로그인 상태를 확인하지 못했습니다.',
    );
  }

  return readUser(response);
}

// ログイン・会員登録の共通処理。成功するとサーバーでログイン状態(セッション)が作られる。
async function postCredentials(
  url: string,
  email: string,
  password: string,
  fallbackMessage: string,
): Promise<User> {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw await parseApiError(response, fallbackMessage);
  }

  return readUser(response);
}

export async function login(
  email: string,
  password: string,
): Promise<User> {
  return postCredentials('/api/auth/login', email, password, '로그인에 실패했습니다.');
}

// サーバーのセッションを終了する。成功すると204が返り、CSRFトークンのCookieも削除される。
export async function logout(): Promise<void> {
  const response = await apiFetch('/api/auth/logout', {
    method: 'POST',
  });

  if (!response.ok) {
    throw await parseApiError(response, 'ログアウトできませんでした。');
  }
}

// 登録に成功すると、そのままログイン状態になる。
export async function signup(
  email: string,
  password: string,
): Promise<User> {
  return postCredentials('/api/auth/signup', email, password, '会員登録に失敗しました。');
}
