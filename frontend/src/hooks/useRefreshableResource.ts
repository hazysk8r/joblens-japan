import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
 * 取り直すのはIDか試行回数が変わったときだけ。fetcherとfallbackMessageが変わっても取り直さず、
 * 次の取得(再試行・再取得・IDの変更)から新しい値を使う。呼び出し側がその場で関数を作って渡しても、
 * 取得が止まらなくなることがないようにするため。別のデータを取るときは、IDのように取り直す条件を変える。
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

  // 取り直す条件に含めないため、最新の値をrefで持つ。
  // 描画中にrefへ書くと、画面に出なかった描画の値が残り得るため、描画の確定後に書く。
  // useLayoutEffectは同じ確定のuseEffectより先に動くため、取得のEffectと、その後の操作からの再取得は最新の値を読む。
  const fetcherRef = useRef(fetcher);
  const fallbackMessageRef = useRef(fallbackMessage);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
    fallbackMessageRef.current = fallbackMessage;
  });

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    return fetcherRef.current(id, controller.signal).then(
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
        const message = caught instanceof ApiError ? caught.message : fallbackMessageRef.current;
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
  }, [id, attempt]);

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
