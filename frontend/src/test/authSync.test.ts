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
  test('localStorage에 매번 다른 무작위 값을 쓰고, 사용자 정보는 쓰지 않는다', () => {
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

  test('localStorage를 쓸 수 없어도 예외를 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => notifyAuthChanged()).not.toThrow();
  });
});

describe('通知を受け取る', () => {
  test('다른 탭이 같은 키에 값을 쓰면 알림을 받는다', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAuthChanged(onChange);

    eventFromOtherTab({ key: KEY, newValue: 'abc' });

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test.each([
    { name: '다른 키', init: { key: 'other-key', newValue: 'abc' } },
    { name: '키 삭제(newValue가 null)', init: { key: KEY, newValue: null } },
    { name: 'localStorage.clear()(key가 null)', init: { key: null, newValue: null } },
  ])('$name: 알림으로 보지 않는다', ({ init }) => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAuthChanged(onChange);

    eventFromOtherTab(init);

    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('해제한 뒤에는 알림을 받지 않는다', () => {
    const onChange = vi.fn();
    subscribeAuthChanged(onChange)();

    eventFromOtherTab({ key: KEY, newValue: 'abc' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
