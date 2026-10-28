import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  AuthContextChangedError,
  CsrfTokenUnavailableError,
  setUnauthorizedHandler,
  switchAuthContext,
} from '../api/apiClient';
import { ApiError } from '../api/apiError';
import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
} from '../api/authApi';
import type { User } from '../types/auth';

import { AuthContext } from './authContext';
import type { AuthContextValue, AuthState } from './authContext';

type AnonymousReason = Extract<AuthState, { status: 'anonymous' }>['reason'];

/**
 * サーバーで処理されていないことが確実な失敗かを判定する。
 * - 4xx: サーバーがリクエストを拒否した(パスワード不一致・登録済み・CSRFなど)。
 * - CSRFトークンを取得できず、リクエストを送らなかった。
 * 5xxや応答なしは、サーバーで処理が終わった後にも起こり得るため「確実」には含めない。
 */
function isCertainFailure(error: unknown): boolean {
  if (error instanceof CsrfTokenUnavailableError) {
    return true;
  }
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * ログイン状態を管理し、apiClientの認証状態(世代・送信するユーザーID)と同期させる。
 *
 * 認証作業(起動時の確認・再確認・ログイン・セッション切れ)は重なることがあるため、
 * 作業ごとに番号を振り、最新の作業の結果だけを状態に反映する。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const operationRef = useRef(0);
  // ログイン中のユーザー。ログアウトの確認で、/meの結果が同じユーザーかを比べるために使う。
  const userRef = useRef<User | null>(null);
  // ログアウトが進行中(最新の認証作業)かを判定する。
  // その間のセッション切れは、利用者が自分でログアウトした結果として扱う。
  const isLoggingOutRef = useRef<() => boolean>(() => false);

  // 新しい認証作業を始め、それが最新の作業かを判定する関数を返す。
  // 以前の作業は、この時点で結果を反映できなくなる。
  const startOperation = useCallback(() => {
    operationRef.current += 1;
    const operation = operationRef.current;
    return () => operation === operationRef.current;
  }, []);

  // apiClientの認証状態と画面の状態を、必ず一緒に切り替える。
  const applyAnonymous = useCallback((reason: AnonymousReason) => {
    switchAuthContext(null);
    userRef.current = null;
    setState({ status: 'anonymous', reason });
  }, []);

  const applyUser = useCallback((user: User | null) => {
    if (user === null) {
      applyAnonymous('initial');
      return;
    }
    switchAuthContext(user.id);
    userRef.current = user;
    setState({ status: 'authenticated', user });
  }, [applyAnonymous]);

  // 状態の変更は応答を受け取った後のコールバックだけで行う(effectから同期的に変更しない)。
  const loadCurrentUser = useCallback((isLatest: () => boolean) => fetchMe().then(
    (user) => {
      if (isLatest()) {
        applyUser(user);
      }
    },
    (error: unknown) => {
      // AuthContextChangedErrorは、より新しい作業が始まって中断されたことを表す。
      // 未ログインやエラーとして扱うと、新しい作業の結果を上書きしてしまう。
      if (isLatest() && !(error instanceof AuthContextChangedError)) {
        setState({ status: 'error' });
      }
    },
  ), [applyUser]);

  useEffect(() => {
    void loadCurrentUser(startOperation());

    const unregister = setUnauthorizedHandler(() => {
      // ログアウトの応答より先に、サーバーでログアウト済みのリクエストの401が届くことがある。
      // その場合はセッション切れではなく、利用者が自分でログアウトした結果として扱う。
      const reason = isLoggingOutRef.current() ? 'loggedOut' : 'expired';
      // 進行中の認証作業の結果を無効にしてから、未ログインに切り替える。
      // 世代を切り替えることで、後から届く古いリクエストの401も通知されなくなる。
      startOperation();
      applyAnonymous(reason);
    });

    return () => {
      unregister();
      // 解除後に届いた認証作業の結果を反映しない。
      startOperation();
    };
  }, [applyAnonymous, loadCurrentUser, startOperation]);

  const retry = useCallback(() => {
    const isLatest = startOperation();
    setState({ status: 'loading' });
    void loadCurrentUser(isLatest);
  }, [loadCurrentUser, startOperation]);

  // ログインと会員登録の共通の流れ。どちらも成功するとサーバーでログイン状態が作られる。
  const authenticate = useCallback(async (request: () => Promise<User>) => {
    const isLatest = startOperation();
    // 認証前の状態で送ったリクエストを中断し、新しいユーザーの画面に結果を渡さない。
    switchAuthContext(null);

    let user: User;
    try {
      user = await request();
    } catch (error) {
      if (!isLatest()) {
        throw new AuthContextChangedError();
      }
      // パスワード不一致や登録済みのメールアドレスなど、処理されていないことが確実な失敗。
      if (isCertainFailure(error)) {
        throw error;
      }

      // 応答を受け取れなかった場合や5xxの場合は、サーバーで処理が完了している可能性がある。
      // 会員登録を再送すると重複エラーになるため、再送せずに現在のログイン状態を確認して決める。
      const verifiedUser = await fetchMe().catch(() => null);
      if (!isLatest()) {
        throw new AuthContextChangedError();
      }
      if (verifiedUser === null) {
        throw error;
      }
      user = verifiedUser;
    }

    if (!isLatest()) {
      throw new AuthContextChangedError();
    }
    applyUser(user);
  }, [applyUser, startOperation]);

  const login = useCallback(
    (email: string, password: string) => authenticate(() => loginRequest(email, password)),
    [authenticate],
  );

  const signup = useCallback(
    (email: string, password: string) => authenticate(() => signupRequest(email, password)),
    [authenticate],
  );

  const logout = useCallback(async () => {
    const isLatest = startOperation();
    isLoggingOutRef.current = isLatest;
    const loggingOutUser = userRef.current;

    // ログアウトは失敗することがあり、失敗したらログイン状態のままにするため、
    // 開始時には世代を切り替えない(サーバーが終了を返した時点で切り替える)。
    let confirmed = false;
    let requestError: unknown = null;
    try {
      await logoutRequest();
      confirmed = true;
    } catch (error) {
      if (!isLatest()) {
        throw new AuthContextChangedError();
      }
      // 4xxなど、処理されていないことが確実な失敗はログイン状態のまま。
      if (isCertainFailure(error)) {
        throw error;
      }
      // 5xxや応答なしは、サーバーでログアウトが終わった可能性がある。
      requestError = error;
    }
    if (!isLatest()) {
      throw new AuthContextChangedError();
    }

    if (confirmed) {
      // サーバーでセッションは終わったので、残っているリクエストをここで中断する。
      // (その401がセッション切れとして扱われないようにする。)
      switchAuthContext(null);
    }

    // 現在のログイン状態を確認する。ログアウトでCSRFトークンのCookieが削除されるため、
    // この照会で新しいトークンも受け取り、次のログインを1回目から成功させる。
    let current: User | null | undefined;
    try {
      current = await fetchMe();
    } catch {
      // 確認できなかった(undefined)。
    }
    if (!isLatest()) {
      throw new AuthContextChangedError();
    }

    if (current === null || (current === undefined && confirmed)) {
      applyAnonymous('loggedOut');
      return;
    }
    if (current === undefined) {
      // ログアウトできたか分からないため、ログイン状態のままにする。
      throw requestError;
    }
    if (current.id === loggingOutUser?.id) {
      // ログアウトされていない。開始前のユーザーに戻す。
      applyUser(current);
      throw requestError ?? new Error('ログアウトできませんでした。');
    }
    // 別のタブなどで別のユーザーがログインしている。その状態に合わせ、前のユーザーの画面を残さない。
    applyUser(current);
  }, [applyAnonymous, applyUser, startOperation]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, logout, retry }),
    [state, login, signup, logout, retry],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
