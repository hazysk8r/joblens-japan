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

  // ログイン済みと確定した場合だけ画面を表示する。
  // 状態をすべて明示し、該当しない状態を既定で表示してしまわないようにする。
  switch (state.status) {
    case 'loading':
    case 'error':
      // 確認中に移動すると、再読み込みのたびにログイン画面が一瞬表示されてしまう。
      return <AuthCheckStatus status={state.status} onRetry={retry} />;

    case 'anonymous':
      // ログイン後に戻れるよう、今の画面の経路を渡す。履歴に残さないようreplaceする。
      return <Navigate to="/login" replace state={loginRedirectState(location)} />;

    case 'authenticated':
      return <Outlet />;

    default: {
      // 状態を追加して、ここでの処理を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

export default RequireAuth;
