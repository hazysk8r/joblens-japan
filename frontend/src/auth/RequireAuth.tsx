import { Navigate, Outlet, useLocation } from 'react-router';

import { loginRedirectState } from '../utils/safeRedirect';

import AuthCheckStatus from './AuthCheckStatus';
import { useAuth } from './useAuth';

/**
 * ログインが必要な画面の入口。
 * ログイン済みなら子の画面を表示し、未ログインならログイン画面へ移動する。
 */
function RequireAuth() {
  const { state, retry } = useAuth();
  const location = useLocation();

  // 確認中に移動すると、再読み込みのたびにログイン画面が一瞬表示されてしまう。
  if (state.status === 'loading' || state.status === 'error') {
    return <AuthCheckStatus status={state.status} onRetry={retry} />;
  }

  if (state.status === 'anonymous') {
    // ログイン後に戻れるよう、今の画面の経路を渡す。履歴に残さないようreplaceする。
    return <Navigate to="/login" replace state={loginRedirectState(location)} />;
  }

  return <Outlet />;
}

export default RequireAuth;
