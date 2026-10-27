import type { ReactNode } from 'react';

import App from '../App';
import { AuthContext } from '../auth/authContext';
import type { AuthContextValue, AuthState } from '../auth/authContext';

/**
 * 画面のテスト用に、ログイン状態を直接与えるProvider。
 *
 * 実際のAuthProviderのような起動時の確認(/me)を行わないため、render直後から画面が表示される。
 * apiClientの認証状態(世代・予想ユーザー)は変更しないので、APIモジュールをmockするテストで使うこと。
 * 認証状態とapiClientの連動を検証するテストでは、実際のAuthProviderを使う。
 */
export function TestAuthProvider({
  children,
  state = { status: 'authenticated', user: { id: 1, email: 'test-user@example.com' } },
}: {
  children: ReactNode;
  state?: AuthState;
}) {
  const value: AuthContextValue = {
    state,
    login: async () => {},
    signup: async () => {},
    retry: () => {},
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ログイン済みの状態で表示するApp。ログイン以外の機能を検証する既存の画面テスト用。
export function AuthenticatedApp() {
  return (
    <TestAuthProvider>
      <App />
    </TestAuthProvider>
  );
}
