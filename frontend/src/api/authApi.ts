import type { User } from '../types/auth';

import { apiFetch } from './apiClient';
import { parseApiError } from './apiError';

/*
 * エラーの種類で、呼び出し元の判断が変わる。
 * - ApiError: サーバーが失敗を返した(例: パスワード不一致)。処理されていないことが確実。
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

export async function login(
  email: string,
  password: string,
): Promise<User> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw await parseApiError(
      response,
      '로그인에 실패했습니다.',
    );
  }

  return readUser(response);
}
