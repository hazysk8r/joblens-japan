import { afterEach, describe, expect, test, vi } from 'vitest';

import { notifyAuthChanged, subscribeAuthChanged } from '../auth/authSync';

/**
 * タブ間の通知を検証する。
 *
 * ブラウザは、localStorageを変更したタブ自身にはstorageイベントを送らず、同じサイトの他のタブにだけ送る。
 * (jsdomも同じ動作であることを確認済み。)そのため、他のタブからの通知はStorageEventを直接作って再現する。
 */

const KEY = 'joblens.auth-changed';

function eventFromOtherTab(init: StorageEventInit) {
  window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('通知を送る', () => {
  test('localStorageに毎回異なるランダムな値を書き、ユーザー情報は書かない', () => {
    notifyAuthChanged();
    const first = localStorage.getItem(KEY);
    notifyAuthChanged();
    const second = localStorage.getItem(KEY);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    // 値はこのキーだけで、メールアドレスなどの形をしていない。
    expect(Object.keys(localStorage)).toEqual([KEY]);
    expect(second).not.toContain('@');
  });

  test('localStorageを使えなくても例外を投げない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => notifyAuthChanged()).not.toThrow();
  });
});

describe('通知を受け取る', () => {
  test('別のタブが同じキーに値を書くと通知を受ける', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAuthChanged(onChange);

    eventFromOtherTab({ key: KEY, newValue: 'abc' });

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test.each([
    { name: '別のキー', init: { key: 'other-key', newValue: 'abc' } },
    { name: 'キーの削除(newValueがnull)', init: { key: KEY, newValue: null } },
    { name: 'localStorage.clear()(keyがnull)', init: { key: null, newValue: null } },
  ])('$name: 通知として扱わない', ({ init }) => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAuthChanged(onChange);

    eventFromOtherTab(init);

    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('解除した後は通知を受けない', () => {
    const onChange = vi.fn();
    subscribeAuthChanged(onChange)();

    eventFromOtherTab({ key: KEY, newValue: 'abc' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
