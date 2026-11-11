import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ApiError } from '../api/apiError';
import { useRefreshableResource } from '../hooks/useRefreshableResource';

const FALLBACK = '取得に失敗しました。';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(fetcher: (id: number, signal: AbortSignal) => Promise<string>, initialId = 1) {
  return renderHook(
    ({ id }) => useRefreshableResource(id, fetcher, FALLBACK),
    { initialProps: { id: initialId } },
  );
}

const loaded = (data: string, refreshError: string | null = null) => ({
  status: 'loaded',
  data,
  refreshError,
});

describe('useRefreshableResource', () => {
  test('開くと取得して結果を返す', async () => {
    const fetcher = vi.fn().mockResolvedValue('データ');

    const { result } = setup(fetcher);

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(1, expect.any(AbortSignal));
  });

  test('サーバーのメッセージを表示する', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('サーバーのエラー', 500));

    const { result } = setup(fetcher);

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', message: 'サーバーのエラー' }));
  });

  test('通信エラーの英語の文言は表示せず、既定のメッセージにする', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = setup(fetcher);

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'error', message: FALLBACK }));
  });

  test('再試行すると読み込み中に戻り、取り直す', async () => {
    const second = deferred<string>();
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new ApiError('失敗', 500))
      .mockReturnValueOnce(second.promise);
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => second.resolve('データ'));
    expect(result.current.state).toEqual(loaded('データ'));
  });

  test('画面を離れると通信を取り消し、その後の再取得では通信しない', async () => {
    const fetcher = vi.fn<(id: number, signal: AbortSignal) => Promise<string>>(
      () => new Promise(() => {}),
    );
    const { result, unmount } = setup(fetcher);
    const signal = fetcher.mock.calls[0][1];
    const { refresh } = result.current;

    unmount();

    expect(signal.aborted).toBe(true);
    await refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('再試行の前の通信が遅れて失敗しても、結果を上書きしない', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = setup(fetcher);

    act(() => result.current.retry());
    expect(fetcher.mock.calls[0][1].aborted).toBe(true);
    await act(async () => second.resolve('新しいデータ'));
    await act(async () => first.reject(new ApiError('古い失敗', 500)));

    expect(result.current.state).toEqual(loaded('新しいデータ'));
  });

  test('再取得の間は今のデータを表示し続ける', async () => {
    const refreshed = deferred<string>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce('古いデータ')
      .mockReturnValueOnce(refreshed.promise);
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state).toEqual(loaded('古いデータ')));

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refresh();
    });

    expect(result.current.state).toEqual(loaded('古いデータ'));
    await act(async () => {
      refreshed.resolve('新しいデータ');
      await refreshing;
    });
    expect(result.current.state).toEqual(loaded('新しいデータ'));
  });

  test('再取得に失敗してもデータを残し、次の成功でエラーを消す', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('データ')
      .mockRejectedValueOnce(new ApiError('再取得の失敗', 500))
      .mockResolvedValueOnce('最新のデータ');
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toEqual(loaded('データ', '再取得の失敗'));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toEqual(loaded('最新のデータ'));
  });

  test('再取得の失敗でも通信エラーの英語の文言は表示しない', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce('データ')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.state).toEqual(loaded('データ', FALLBACK));
  });

  test('新しい再取得が始まると前の再取得を取り消し、遅れた応答を使わない', async () => {
    const older = deferred<string>();
    const newer = deferred<string>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce('データ')
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));

    act(() => {
      void result.current.refresh();
    });
    act(() => {
      void result.current.refresh();
    });

    expect(fetcher.mock.calls[1][1].aborted).toBe(true);
    await act(async () => newer.resolve('新しい応答'));
    await act(async () => older.resolve('古い応答'));
    expect(result.current.state).toEqual(loaded('新しい応答'));
  });

  test('最初の取得中の再取得が失敗したら、読み込み中のままにせずエラーにする', async () => {
    const fetcher = vi.fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new ApiError('再取得の失敗', 500));
    const { result } = setup(fetcher);

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetcher.mock.calls[0][1].aborted).toBe(true);
    expect(result.current.state).toEqual({ status: 'error', message: '再取得の失敗' });
  });

  test('エラーの状態で再取得に成功したら、データを表示する', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new ApiError('失敗', 500))
      .mockResolvedValueOnce('データ');
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.state).toEqual(loaded('データ'));
  });

  test('再試行の前に受け取ったrefreshでも、今の試行として取得する', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new ApiError('失敗', 500))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce('データ');
    const { result } = setup(fetcher);
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    const { refresh } = result.current;

    act(() => result.current.retry());
    await act(async () => {
      await refresh();
    });

    expect(result.current.state).toEqual(loaded('データ'));
  });

  test('IDが変わると前のIDのデータを表示せず、前の通信を取り消す', async () => {
    const pending = deferred<string>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce('IDが1のデータ')
      .mockReturnValueOnce(pending.promise);
    const { result, rerender } = setup(fetcher);
    await waitFor(() => expect(result.current.state).toEqual(loaded('IDが1のデータ')));

    rerender({ id: 2 });

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(fetcher).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));
    await act(async () => pending.resolve('IDが2のデータ'));
    expect(result.current.state).toEqual(loaded('IDが2のデータ'));
  });

  describe('渡す関数と文言が変わったとき', () => {
    type Props = {
      fetcher: (id: number, signal: AbortSignal) => Promise<string>;
      fallbackMessage: string;
    };

    function setupWith(initialProps: Props) {
      return renderHook(
        ({ fetcher, fallbackMessage }: Props) => useRefreshableResource(1, fetcher, fallbackMessage),
        { initialProps },
      );
    }

    test('レンダーごとに新しい関数を渡しても、取得は1回だけで読み込みを終える', async () => {
      const base = vi.fn().mockResolvedValue('データ');
      const { result } = renderHook(() =>
        // 呼び出し側が関数をその場で作る書き方。
        useRefreshableResource(1, (id, signal) => base(id, signal), FALLBACK));

      await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));
      // 取得のやり直しが続いていないことを、何度か待って確かめる。
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
      expect(base).toHaveBeenCalledTimes(1);
    });

    test('取得中に新しい関数で描画し直しても、通信を取り消さない', async () => {
      const pending = deferred<string>();
      const first = vi.fn().mockReturnValue(pending.promise);
      const { result, rerender } = setupWith({ fetcher: first, fallbackMessage: FALLBACK });
      const signal = first.mock.calls[0][1] as AbortSignal;

      rerender({ fetcher: vi.fn().mockResolvedValue('別のデータ'), fallbackMessage: FALLBACK });

      expect(signal.aborted).toBe(false);
      await act(async () => pending.resolve('データ'));
      expect(result.current.state).toEqual(loaded('データ'));
    });

    test('別の関数に変えても、すぐには取り直さず、次の再取得と再試行から使う', async () => {
      const first = vi.fn().mockResolvedValue('前のデータ');
      const next = vi.fn().mockResolvedValue('新しいデータ');
      const { result, rerender } = setupWith({ fetcher: first, fallbackMessage: FALLBACK });
      await waitFor(() => expect(result.current.state).toEqual(loaded('前のデータ')));

      rerender({ fetcher: next, fallbackMessage: FALLBACK });
      expect(next).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.refresh();
      });
      expect(next).toHaveBeenCalledTimes(1);
      expect(result.current.state).toEqual(loaded('新しいデータ'));

      act(() => result.current.retry());
      await waitFor(() => expect(next).toHaveBeenCalledTimes(2));
      expect(first).toHaveBeenCalledTimes(1);
    });

    test('文言を変えても取り直さず、次の失敗から新しい文言を使う', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('データ')
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result, rerender } = setupWith({ fetcher, fallbackMessage: FALLBACK });
      await waitFor(() => expect(result.current.state).toEqual(loaded('データ')));

      rerender({ fetcher, fallbackMessage: '新しい文言' });
      expect(fetcher).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.state).toEqual(loaded('データ', '新しい文言'));
    });
  });
});
