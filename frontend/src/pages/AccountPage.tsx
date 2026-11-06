import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';

import { AuthContextChangedError } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { useAuth } from '../auth/useAuth';

import './AccountPage.css';

const PASSWORD_ERROR_ID = 'account-delete-password-error';

/**
 * アカウント設定の画面。いまはアカウントの削除だけを扱う。
 *
 * 削除できた後の画面の移動は行わない。認証状態が変わると、RequireAuthがログイン画面へ移動する。
 */
function AccountPage() {
  const { state, deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // RequireAuthの内側でだけ表示されるため、ここでは常にログイン済み。
  if (state.status !== 'authenticated') {
    return null;
  }
  const { email } = state.user;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitting(true);
    setPasswordError(null);
    setFormError(null);

    try {
      await deleteAccount(password);
    } catch (caughtError) {
      // より新しい認証作業(セッション切れの確認など)に置き換えられた場合は、その結果に任せる。
      if (caughtError instanceof AuthContextChangedError) {
        return;
      }

      // パスワードは再入力してもらう。
      setPassword('');
      if (caughtError instanceof ApiError && caughtError.fieldErrors.password) {
        setPasswordError(caughtError.fieldErrors.password);
        return;
      }
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : 'アカウントを削除できませんでした。しばらくしてから再度お試しください。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="account-page">
      <header className="account-page-header">
        <h1>JobLens Japan</h1>
        <Link to="/" className="back-to-home-link">← 求人一覧に戻る</Link>
      </header>

      <section className="account-page-content">
        <h2>アカウントの削除</h2>

        <dl className="account-page-email">
          <dt>メールアドレス</dt>
          <dd>{email}</dd>
        </dl>

        <p className="account-page-warning">
          アカウントを削除すると、登録した求人・メモ・応募ステータスの変更履歴もすべて削除され、元に戻せません。
        </p>

        <form onSubmit={handleSubmit}>
          {/* パスワード管理ツールが、どのアカウントのパスワードかを判断できるようにする。 */}
          <input type="email" autoComplete="username" value={email} readOnly hidden />

          <div className="account-page-field">
            <label htmlFor="account-delete-password">パスワード</label>
            <input
              id="account-delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? PASSWORD_ERROR_ID : undefined}
            />
            {passwordError && (
              <p id={PASSWORD_ERROR_ID} className="account-page-error">{passwordError}</p>
            )}
          </div>

          {formError && <p role="alert" className="account-page-error">{formError}</p>}

          <button type="submit" className="account-page-delete" disabled={submitting || password === ''}>
            {submitting ? '削除中…' : 'アカウントを削除する'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default AccountPage;
