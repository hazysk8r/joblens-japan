import { afterEach, expect, test, vi } from 'vitest';

/**
 * HTTPSでもlocalhostでもない環境(例: 同じWi-Fiのスマートフォンから http://192.168.x.x で接続)では、
 * crypto.randomUUIDが存在しない。その環境でもapiClientを読み込めて動作することを確認する。
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('crypto.randomUUID가 없는 HTTP 환경에서도 apiClient를 불러와 인증 상태를 전환할 수 있다', async () => {
  // 安全でないコンテキストのブラウザと同じく、getRandomValuesだけを持つcryptoにする。
  const realCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: realCrypto.getRandomValues.bind(realCrypto),
  });
  vi.resetModules();

  // モジュールの読み込み時に最初の認証状態を作るため、読み込み自体が失敗しないことが重要。
  const { apiFetch, switchAuthContext, AuthContextChangedError } =
    await import('../api/apiClient');

  vi.stubGlobal('fetch', vi.fn().mockImplementation(
    (_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }),
  ));

  // 切り替え前後で別の認証状態として扱われる(古いリクエストが中断される)ことを確認する。
  switchAuthContext(1);
  const request = apiFetch('/api/job-postings');
  switchAuthContext(2);

  await expect(request).rejects.toBeInstanceOf(AuthContextChangedError);
});
