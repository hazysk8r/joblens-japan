import { createContext } from 'react';

import type { User } from '../types/auth';

export type AuthState =
  // 起動時のログイン状態の確認中。
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  // reason: 未ログインになった理由。ログイン画面の案内と、ログイン後の戻り先の扱いが変わる。
  //   initial: 起動時の確認で未ログインだった / expired: ログイン中にセッションが切れた /
  //   loggedOut: 利用者が自分でログアウトした(次の利用者を前の画面に戻さない) /
  //   loggedOutElsewhere: 同じブラウザの別のタブでログアウトした
  | { status: 'anonymous'; reason: 'initial' | 'expired' | 'loggedOut' | 'loggedOutElsewhere' }
  // ログイン状態を確認できなかった(サーバー障害・オフラインなど)。未ログインとは区別する。
  | { status: 'error' };

export interface AuthContextValue {
  state: AuthState;
  // 失敗時はエラーを投げる。より新しい認証作業に置き換えられた場合はAuthContextChangedErrorを投げる。
  login: (email: string, password: string) => Promise<void>;
  // 登録に成功するとログイン状態になる。失敗時の扱いはloginと同じ。
  signup: (email: string, password: string) => Promise<void>;
  // ログアウトできなかった場合はエラーを投げ、ログイン状態のままにする。
  logout: () => Promise<void>;
  // ログイン状態の確認をやり直す。
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
