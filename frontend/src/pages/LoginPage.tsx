import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';

import { AuthContextChangedError } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import AuthCheckStatus from '../auth/AuthCheckStatus';
import { useAuth } from '../auth/useAuth';
import { redirectPathFromState } from '../utils/safeRedirect';

import './LoginPage.css';

function LoginPage() {
  const { state, login, retry } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'loading' || state.status === 'error') {
    return <AuthCheckStatus status={state.status} onRetry={retry} />;
  }

  // ログイン後の移動はここだけで行う(ログイン処理の成功時には移動しない)。
  // ログイン済みでこの画面を開いた場合も、同じ規則で戻り先へ移動する。
  if (state.status === 'authenticated') {
    return <Navigate to={redirectPathFromState(location.state)} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      await login(email.trim(), password);
    } catch (caughtError) {
      // より新しい認証作業に置き換えられた場合は、この画面で知らせることはない。
      if (caughtError instanceof AuthContextChangedError) {
        return;
      }

      // パスワードは再入力してもらう。メールアドレスは残す。
      setPassword('');
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <header className="login-page-header">
        <h1>JobLens Japan</h1>
      </header>

      <section className="login-page-content">
        <h2>ログイン</h2>

        {state.reason === 'expired' && (
          <p className="login-page-notice">세션이 만료되었습니다. 다시 로그인해주세요.</p>
        )}
        {state.reason === 'loggedOut' && (
          <p className="login-page-notice">ログアウトしました。</p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">メールアドレス</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">パスワード</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p role="alert" className="login-page-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting || email.trim() === '' || password === ''}
          >
            {submitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <p className="login-page-switch">
          アカウントをお持ちでない方は
          {/* 登録後の戻り先を引き継ぐ。 */}
          <Link to="/signup" state={location.state}>会員登録</Link>
        </p>
      </section>
    </main>
  );
}

export default LoginPage;
