import { createContext } from 'react';

import type { User } from '../types/auth';

export type AuthState =
  // 起動時のログイン状態の確認中。
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  // sessionExpired: ログイン中にセッションが切れて未ログインになった場合にtrue。
  | { status: 'anonymous'; sessionExpired: boolean }
  // ログイン状態を確認できなかった(サーバー障害・オフラインなど)。未ログインとは区別する。
  | { status: 'error' };

export interface AuthContextValue {
  state: AuthState;
  // 失敗時はエラーを投げる。より新しい認証作業に置き換えられた場合はAuthContextChangedErrorを投げる。
  login: (email: string, password: string) => Promise<void>;
  // ログイン状態の確認をやり直す。
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
