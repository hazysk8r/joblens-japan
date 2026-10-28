import { useState } from 'react';
import { Outlet } from 'react-router';

import { AuthContextChangedError } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import type { User } from '../types/auth';

import { useAuth } from './useAuth';

import './AuthenticatedLayout.css';

/**
 * ログインが必要な画面の共通部分。ログイン中のアカウントとログアウトボタンを表示する。
 *
 * ログアウトに成功しても、ここでは画面を移動しない。
 * 認証状態が未ログインに変わると、RequireAuthがログイン画面へ移動する。
 */
function AuthenticatedLayout({ user }: { user: User }) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    setError(null);

    try {
      await logout();
    } catch (caughtError) {
      // より新しい認証作業(セッション切れなど)に置き換えられた場合は、その結果に任せる。
      if (caughtError instanceof AuthContextChangedError) {
        return;
      }
      // ログアウトできなかったことを伝える(ログアウトしたと誤解させない)。
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'ログアウトできませんでした。通信状況を確認して、もう一度お試しください。',
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <header className="account-bar">
        <span className="account-bar-email">{user.email}</span>
        <button type="button" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'ログアウト中…' : 'ログアウト'}
        </button>
        {error && <p role="alert" className="account-bar-error">{error}</p>}
      </header>

      <Outlet />
    </>
  );
}

export default AuthenticatedLayout;
