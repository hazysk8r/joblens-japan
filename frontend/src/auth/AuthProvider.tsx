import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import {
  AuthContextChangedError,
  CsrfTokenUnavailableError,
  setAuthContextMismatchHandler,
  setUnauthorizedHandler,
  switchAuthContext,
} from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { clearAllDrafts } from '../utils/draftStorage';
import {
  deleteAccount as deleteAccountRequest,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
} from '../api/authApi';
import type { User } from '../types/auth';

import { notifyAuthChanged, subscribeAuthChanged } from './authSync';
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
  // アカウントの削除が進行中(最新の認証作業)かを判定する。
  // 他のリクエストの401だけでは削除できたか分からないため、その間は削除の応答で判断する。
  const isDeletingAccountRef = useRef<() => boolean>(() => false);
  // 削除の進行中に、他のリクエストが401を受け取ったか。
  const unauthorizedWhileDeletingRef = useRef(false);

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
    // セッション切れは同じ人がログインし直すため、入力途中のメモや求人を残す。
    if (reason !== 'expired' && reason !== 'initial') {
      clearAllDrafts();
    }
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

  /**
   * 画面とサーバーのセッションが食い違った可能性があるときに、/meで現在のログイン状態を確認し直す。
   * (他のタブでのログイン・ログアウト、401、409 AUTH_CONTEXT_CHANGED)
   *
   * 確認中は保護画面を隠す。世代を切り替えた後に前のユーザーの画面で操作すると、
   * そのリクエストが現在のセッションの別のユーザーとして処理されるおそれがあるため。
   * 確認の結果は他のタブに通知しない(タブ同士が通知し合い続けないようにする)。
   */
  const recheck = useCallback((cause: 'otherTab' | 'serverRejected') => {
    const isLatest = startOperation();
    switchAuthContext(null);
    userRef.current = null;
    setState({ status: 'loading' });

    void fetchMe().then(
      (user) => {
        if (!isLatest()) {
          return;
        }
        if (user) {
          applyUser(user);
        } else {
          applyAnonymous(cause === 'otherTab' ? 'loggedOutElsewhere' : 'expired');
        }
      },
      (error: unknown) => {
        if (isLatest() && !(error instanceof AuthContextChangedError)) {
          setState({ status: 'error' });
        }
      },
    );
  }, [applyAnonymous, applyUser, startOperation]);

  useEffect(() => {
    void loadCurrentUser(startOperation());

    const unregisterUnauthorized = setUnauthorizedHandler(() => {
      // 削除の応答を待ち、削除できなかった場合に確認し直す。
      if (isDeletingAccountRef.current()) {
        unauthorizedWhileDeletingRef.current = true;
        return;
      }
      // ログアウトの応答より先に、サーバーでログアウト済みのリクエストの401が届くことがある。
      // その場合はセッション切れではなく、利用者が自分でログアウトした結果として扱う。
      if (isLoggingOutRef.current()) {
        startOperation();
        applyAnonymous('loggedOut');
        // 401でサーバーのセッションがないことは確定しているため、他のタブにも知らせる。
        // (この後のログアウトの応答は中断扱いになり、logout側の通知には届かない。)
        notifyAuthChanged();
        return;
      }
      // ログインしていない状態の401は、新しいことを示さない(「ログアウトしました」などの案内を上書きしない)。
      if (userRef.current === null) {
        return;
      }
      // 別のタブで別のユーザーがログインした場合も401になり得るため、すぐにセッション切れとはしない。
      recheck('serverRejected');
    });
    const unregisterMismatch = setAuthContextMismatchHandler(() => recheck('serverRejected'));
    const unsubscribeOtherTabs = subscribeAuthChanged(() => recheck('otherTab'));

    return () => {
      unregisterUnauthorized();
      unregisterMismatch();
      unsubscribeOtherTabs();
      // 解除後に届いた認証作業の結果を反映しない。
      startOperation();
    };
  }, [applyAnonymous, loadCurrentUser, recheck, startOperation]);

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
    // このタブでログイン状態を変えたことを、他のタブに知らせる。
    notifyAuthChanged();
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
    // ログアウトが終わったら(失敗も含む)、「ログアウト中」の判定を解除する。
    // 残したままだと、ログアウトに失敗した後の本当のセッション切れまでログアウト扱いになる。
    try {
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
        // このタブでログアウトしたことを、他のタブに知らせる。
        notifyAuthChanged();
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
    } finally {
      if (isLoggingOutRef.current === isLatest) {
        isLoggingOutRef.current = () => false;
      }
    }
  }, [applyAnonymous, applyUser, startOperation]);

  const deleteAccount = useCallback(async (password: string) => {
    const isLatest = startOperation();
    isDeletingAccountRef.current = isLatest;
    unauthorizedWhileDeletingRef.current = false;
    try {
      const deletingUser = userRef.current;

      // 削除は失敗することがあり、失敗したらログイン状態のままにするため、
      // 開始時には世代を切り替えない(サーバーが削除を返した時点で切り替える)。
      let confirmed = false;
      try {
        await deleteAccountRequest(password);
        confirmed = true;
      } catch (error) {
        if (!isLatest()) {
          throw new AuthContextChangedError();
        }
        // 削除のリクエスト自体が401なら、すでにセッションがない。通常の確認に任せる。
        if (error instanceof ApiError && error.status === 401) {
          recheck('serverRejected');
          throw new AuthContextChangedError();
        }
        // 4xxなど、処理されていないことが確実な失敗はログイン状態のまま。
        if (isCertainFailure(error)) {
          // 待っている間に他のリクエストが401を受け取っていたら、セッションが切れたかを確認する。
          if (unauthorizedWhileDeletingRef.current) {
            recheck('serverRejected');
          }
          throw error;
        }
        // 5xxや応答なしは、サーバーで削除が終わった可能性がある。下で確認する。
      }
      if (!isLatest()) {
        throw new AuthContextChangedError();
      }

      if (confirmed) {
        // サーバーでセッションは終わったので、残っているリクエストをここで中断する。
        switchAuthContext(null);
      }

      // 削除でCSRFトークンのCookieも削除されるため、この照会で新しいトークンを受け取る。
      let current: User | null | undefined;
      try {
        current = await fetchMe();
      } catch {
        // 確認できなかった(undefined)。
      }
      if (!isLatest()) {
        throw new AuthContextChangedError();
      }

      if (confirmed) {
        // 削除の後に、別のタブなどで別のユーザーがログインしている。ログアウトと同じく、その状態に合わせる。
        // 削除したユーザーが返ることはないため、同じユーザーなら削除の応答を信じる。
        if (current && current.id !== deletingUser?.id) {
          applyUser(current);
          return;
        }
        applyAnonymous('accountDeleted');
        notifyAuthChanged();
        return;
      }
      if (current === null) {
        // セッションがないことは確かだが、削除されたかは分からない(期限切れの可能性もある)。
        applyAnonymous('accountDeletionUnconfirmed');
        notifyAuthChanged();
        return;
      }
      if (current === undefined) {
        throw new Error('アカウントを削除できたか確認できませんでした。ページを再読み込みして確認してください。');
      }
      if (current.id === deletingUser?.id) {
        applyUser(current);
        throw new Error('アカウントを削除できませんでした。しばらくしてから再度お試しください。');
      }
      // 別のタブなどで別のユーザーがログインしている。その状態に合わせる。
      applyUser(current);
    } finally {
      if (isDeletingAccountRef.current === isLatest) {
        isDeletingAccountRef.current = () => false;
      }
    }
  }, [applyAnonymous, applyUser, recheck, startOperation]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, logout, deleteAccount, retry }),
    [state, login, signup, logout, deleteAccount, retry],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
