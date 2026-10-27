import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  AuthContextChangedError,
  setUnauthorizedHandler,
  switchAuthContext,
} from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { fetchMe, login as loginRequest, signup as signupRequest } from '../api/authApi';
import type { User } from '../types/auth';

import { AuthContext } from './authContext';
import type { AuthContextValue, AuthState } from './authContext';

/**
 * ログイン状態を管理し、apiClientの認証状態(世代・送信するユーザーID)と同期させる。
 *
 * 認証作業(起動時の確認・再確認・ログイン・セッション切れ)は重なることがあるため、
 * 作業ごとに番号を振り、最新の作業の結果だけを状態に反映する。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const operationRef = useRef(0);

  // 新しい認証作業を始め、それが最新の作業かを判定する関数を返す。
  // 以前の作業は、この時点で結果を反映できなくなる。
  const startOperation = useCallback(() => {
    operationRef.current += 1;
    const operation = operationRef.current;
    return () => operation === operationRef.current;
  }, []);

  const applyUser = useCallback((user: User | null) => {
    switchAuthContext(user?.id ?? null);
    setState(user
      ? { status: 'authenticated', user }
      : { status: 'anonymous', sessionExpired: false });
  }, []);

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
      // 進行中の認証作業の結果を無効にしてから、未ログインに切り替える。
      // 世代を切り替えることで、後から届く古いリクエストの401も通知されなくなる。
      startOperation();
      switchAuthContext(null);
      setState({ status: 'anonymous', sessionExpired: true });
    });

    return () => {
      unregister();
      // 解除後に届いた認証作業の結果を反映しない。
      startOperation();
    };
  }, [loadCurrentUser, startOperation]);

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
      // パスワード不一致や登録済みのメールアドレスなど、サーバーが失敗を返した場合は処理されていない。
      if (error instanceof ApiError) {
        throw error;
      }

      // 応答を受け取れなかった場合は、サーバーで処理が完了している可能性がある。
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

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, retry }),
    [state, login, signup, retry],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
