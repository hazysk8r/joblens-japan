import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';

import { AuthContextChangedError } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import AuthCheckStatus from '../auth/AuthCheckStatus';
import { useAuth } from '../auth/useAuth';
import { redirectPathFromState } from '../utils/safeRedirect';
import { validateSignup } from '../utils/signupValidation';
import type { SignupFieldErrors, SignupInput } from '../utils/signupValidation';

import './LoginPage.css';

const EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS';

type Field = keyof SignupInput;

function SignupPage() {
  const { state, signup, retry } = useAuth();
  const location = useLocation();

  const [input, setInput] = useState<SignupInput>({
    email: '',
    password: '',
    passwordConfirmation: '',
  });
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  // 登録済みのメールアドレスの場合は、ログイン画面への案内を表示する。
  const [emailAlreadyExists, setEmailAlreadyExists] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'loading' || state.status === 'error') {
    return <AuthCheckStatus status={state.status} onRetry={retry} />;
  }

  // 登録後の移動はここだけで行う(登録処理の成功時には移動しない)。
  // ログイン済みでこの画面を開いた場合も、同じ規則で戻り先へ移動する。
  if (state.status === 'authenticated') {
    return <Navigate to={redirectPathFromState(location.state)} replace />;
  }

  const updateField = (field: Field, value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setFormError(null);
    setEmailAlreadyExists(false);

    // サーバーと同じ規則で分かる誤りは、送信せずに知らせる。
    const clientErrors = validateSignup(input);
    setFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      // パスワードの前後の空白はパスワードの一部として扱い、そのまま送る。
      await signup(input.email.trim(), input.password);
    } catch (caughtError) {
      // より新しい認証作業に置き換えられた場合は、この画面で知らせることはない。
      if (caughtError instanceof AuthContextChangedError) {
        return;
      }

      // パスワードは新しく決めている途中のため、失敗しても消さない。
      if (caughtError instanceof ApiError) {
        if (caughtError.code === EMAIL_ALREADY_EXISTS) {
          setFieldErrors({ email: caughtError.message });
          setEmailAlreadyExists(true);
          return;
        }

        // 画面にない項目のエラーは表示する場所がないため、全体のメッセージも必ず表示する。
        // (項目のエラーだけにすると、表示されずに「押しても何も起きない」状態になる。)
        setFieldErrors(caughtError.fieldErrors);
        setFormError(caughtError.message);
        return;
      }

      setFormError('サーバーに接続できませんでした。しばらくしてから再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const errorIdOf = (field: Field) => `signup-${field}-error`;

  const fieldErrorAttributes = (field: Field) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? errorIdOf(field) : undefined,
  });

  const renderFieldError = (field: Field) => {
    if (!fieldErrors[field]) {
      return null;
    }

    return (
      <p id={errorIdOf(field)} className="login-page-error">
        {fieldErrors[field]}
        {field === 'email' && emailAlreadyExists && (
          <>
            {' '}
            {/* ログイン後の戻り先を引き継ぐ。 */}
            <Link to="/login" state={location.state}>ログイン画面へ</Link>
          </>
        )}
      </p>
    );
  };

  return (
    <main className="login-page">
      <header className="login-page-header">
        <h1>JobLens Japan</h1>
      </header>

      <section className="login-page-content">
        <h2>会員登録</h2>

        {/* 入力チェックは画面側で行い、メッセージを統一するためブラウザの検証は使わない。 */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label htmlFor="signup-email">メールアドレス</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="username"
              value={input.email}
              onChange={(event) => updateField('email', event.target.value)}
              {...fieldErrorAttributes('email')}
            />
            {renderFieldError('email')}
          </div>

          <div className="login-field">
            <label htmlFor="signup-password">パスワード</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={input.password}
              onChange={(event) => updateField('password', event.target.value)}
              {...fieldErrorAttributes('password')}
            />
            {renderFieldError('password')}
          </div>

          <div className="login-field">
            <label htmlFor="signup-password-confirmation">パスワード（確認）</label>
            <input
              id="signup-password-confirmation"
              type="password"
              autoComplete="new-password"
              value={input.passwordConfirmation}
              onChange={(event) => updateField('passwordConfirmation', event.target.value)}
              {...fieldErrorAttributes('passwordConfirmation')}
            />
            {renderFieldError('passwordConfirmation')}
          </div>

          {formError && <p role="alert" className="login-page-error">{formError}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? '登録中…' : '登録する'}
          </button>
        </form>

        <p className="login-page-switch">
          すでにアカウントをお持ちの方は
          {/* ログイン後の戻り先を引き継ぐ。 */}
          <Link to="/login" state={location.state}>ログイン</Link>
        </p>
      </section>
    </main>
  );
}

export default SignupPage;
