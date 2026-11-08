/**
 * 詳細画面から一覧へ戻るときに、一覧の検索条件(URLのクエリ)を引き継ぐ。
 *
 * 検索条件はナビゲーションのstate(history.state)で渡す。詳細画面のURLに載せると、
 * 共有したURLに検索語(応募先の会社名など)が残ってしまうため。
 * stateはブラウザの履歴に保存された値で、型を信用できないため、検証してから使う。
 * 戻り先のパスは一覧(/)に固定し、stateから使うのは「?」で始まるクエリだけにする。
 */

const LIST_PATH = '/';

// 一覧から詳細画面へ移動するときに渡すstateを作る。
export function listReturnState(search: string): { listSearch: string } {
  return { listSearch: search };
}

// stateから一覧へ戻るパスを作る。検証できない場合は検索条件なしの一覧にする。
export function listPathFromState(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('listSearch' in state)) {
    return LIST_PATH;
  }

  const { listSearch } = state;
  if (typeof listSearch !== 'string' || !listSearch.startsWith('?')) {
    return LIST_PATH;
  }

  return `${LIST_PATH}${listSearch}`;
}
