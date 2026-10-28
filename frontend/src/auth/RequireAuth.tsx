import { Navigate, useLocation } from 'react-router';

import { loginRedirectState } from '../utils/safeRedirect';

import AuthCheckStatus from './AuthCheckStatus';
import AuthenticatedLayout from './AuthenticatedLayout';
import type { AuthState } from './authContext';
import { useAuth } from './useAuth';

type AnonymousReason = Extract<AuthState, { status: 'anonymous' }>['reason'];

/**
 * 未ログインになった理由ごとに、ログイン後に今の画面へ戻すかを決める。
 * 理由を追加したときに判断を書き忘れると、型エラーになる。
 */
function keepsReturnPath(reason: AnonymousReason): boolean {
  switch (reason) {
    case 'initial':
    case 'expired':
      return true;
    // 自分でログアウトした場合(別のタブを含む)は、次の利用者を前の画面に戻さない。
    case 'loggedOut':
    case 'loggedOutElsewhere':
      return false;
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}

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
      if (!keepsReturnPath(state.reason)) {
        return <Navigate to="/login" replace />;
      }
      // ログイン後に戻れるよう、今の画面の経路を渡す。履歴に残さないようreplaceする。
      return <Navigate to="/login" replace state={loginRedirectState(location)} />;

    case 'authenticated':
      // ユーザーが変わったら、アカウント表示とログインが必要な画面をまとめて作り直し、
      // 前のユーザーの画面の状態(入力中の内容・取得済みのデータ・エラー表示など)を残さない。
      return <AuthenticatedLayout key={state.user.id} user={state.user} />;

    default: {
      // 状態を追加して、ここでの処理を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

export default RequireAuth;
