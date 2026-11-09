import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/apiError';

export type RefreshableResourceState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T; refreshError: string | null }
  | { status: 'error'; message: string };

type Result<T> = {
  id: number;
  attempt: number;
  state: RefreshableResourceState<T>;
};

/**
 * 詳細画面の領域ごとのデータを自動で取得し、変更の後に取り直せるようにする。
 *
 * retryは読み込み中に戻して最初から取り直す。refreshは今のデータを表示したまま裏で取り直し、
 * 失敗してもデータは消さない。一覧を画面から外すと、編集中のフォームの入力が失われるため。
 * 新しい取得を始めるときと画面を離れるときに前の通信を取り消し、取り消した通信の結果は反映しない。
 *
 * fetcherはレンダーごとに変わらない関数を渡す。
 */
export function useRefreshableResource<T>(
  id: number,
  fetcher: (id: number, signal: AbortSignal) => Promise<T>,
  fallbackMessage: string,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  // 画面を離れた後はnullになり、完了した変更からの再取得を行わない。
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    return fetcher(id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ id, attempt, state: { status: 'loaded', data, refreshError: null } });
        }
      },
      (caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        // サーバーのメッセージだけを表示する。通信エラーやJSONの解析エラーの文言は英語で、応答の本文を含むこともある。
        const message = caught instanceof ApiError ? caught.message : fallbackMessage;
        setResult((previous) => ({
          id,
          attempt,
          state: previous !== null
            && previous.id === id
            && previous.attempt === attempt
            && previous.state.status === 'loaded'
            ? { ...previous.state, refreshError: message }
            : { status: 'error', message },
        }));
      },
    );
  }, [id, attempt, fetcher, fallbackMessage]);

  // 変更の完了時には、変更の開始時より後のIDと試行回数で取得する必要があるため、最新のloadを保持する。
  const latestLoadRef = useRef(load);

  useEffect(() => {
    latestLoadRef.current = load;
    void load();

    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [load]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const refresh = useCallback(async () => {
    if (controllerRef.current !== null) {
      await latestLoadRef.current();
    }
  }, []);

  const isCurrent = result !== null && result.id === id && result.attempt === attempt;
  const state: RefreshableResourceState<T> = isCurrent ? result.state : { status: 'loading' };

  return { state, retry, refresh };
}
