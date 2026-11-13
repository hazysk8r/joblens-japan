/**
 * 画面を移った先で、前の画面の操作の結果(登録した・削除した)を知らせるための値。
 *
 * 移る前の画面では、すぐ移るため知らせが見えない。そのため、移動のstate(history.state)で知らせの種類だけを渡し、
 * 文言は受け取る画面が決める。stateはブラウザの履歴に残る値で型を信用できないため、決まった値だけを受け付ける。
 */
export type NavigationNotice = 'created' | 'deleted';

export const NAVIGATION_NOTICE_TEXT: Record<NavigationNotice, string> = {
  created: '求人を登録しました。',
  deleted: '求人を削除しました。',
};

// stateの知らせが、この画面で受け付ける種類ならその種類を返す。それ以外はnull。
export function navigationNoticeOf(state: unknown, accepted: NavigationNotice): NavigationNotice | null {
  if (typeof state !== 'object' || state === null || !('notice' in state)) {
    return null;
  }
  return state.notice === accepted ? accepted : null;
}

// 知らせを取り除いたstate。新しく読み込んだり、戻る・進むで同じ履歴に来たりしたときに、もう一度知らせないため。
export function withoutNotice(state: unknown): unknown {
  if (typeof state !== 'object' || state === null || !('notice' in state)) {
    return state;
  }
  const rest: Record<string, unknown> = { ...state };
  delete rest.notice;
  return Object.keys(rest).length > 0 ? rest : null;
}
