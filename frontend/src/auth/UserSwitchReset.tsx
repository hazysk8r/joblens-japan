import { useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from './useAuth';

/**
 * このタブで前回ログインしていたユーザーと別のユーザーになったら、トップ画面(クエリなし)へ移動する。
 *
 * 画面を作り直してもURLは残る。一覧画面は検索条件をURLから読むため、そのままだと
 * 前のユーザーの検索語(応募先の会社名など)で次のユーザーの画面が始まってしまう。
 * セッション切れ後に別のユーザーがログインした場合も、前のユーザーの戻り先は使わない。
 *
 * ログイン画面ではRequireAuthが表示されないため、ルート全体を包む位置で前回のユーザーを覚えておく。
 */
function UserSwitchReset({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  const userId = state.status === 'authenticated' ? state.user.id : null;
  // 未ログインの間も、最後にログインしていたユーザーを覚えておく。
  const [lastUserId, setLastUserId] = useState<number | null>(userId);
  const [resetting, setResetting] = useState(false);

  // 描画中に前回の値と比べて状態を更新する(Reactが推奨する「前回の値を保持する」方法)。
  if (userId !== null && userId !== lastUserId) {
    setLastUserId(userId);
    if (lastUserId !== null) {
      setResetting(true);
    }
  }

  if (resetting) {
    const atTop = location.pathname === '/' && location.search === '' && location.hash === '';
    if (!atTop) {
      // 移動が終わるまで画面を表示しない(前のユーザーのURLで画面を作らない)。
      return <Navigate to="/" replace />;
    }
    setResetting(false);
  }

  return children;
}

export default UserSwitchReset;
