import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { apiFetch, switchAuthContext } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { fetchMe, login, logout } from '../api/authApi';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * ログアウトと、ユーザーが切り替わったときの画面の扱いを検証する。
 *
 * 認証状態の遷移は実際のAuthProviderを使い、通信部分(authApi・求人API)だけをmockする。
 * 実際のリクエストとCSRFトークンの取り直しは AuthSeam.test.tsx で確認する。
 */

vi.mock('../api/authApi');
vi.mock('../api/jobPostingApi');

const userA = { id: 1, email: 'user-a@example.com' };
const userB = { id: 2, email: 'user-b@example.com' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function LocationDisplay() {
  const location = useLocation();
  return (
    <>
      <div data-testid="location">{location.pathname + location.search + location.hash}</div>
      <div data-testid="location-state">{JSON.stringify(location.state)}</div>
    </>
  );
}

function renderApp(entry: string | { pathname: string; state: unknown } = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function currentLocation() {
  return screen.getByTestId('location').textContent;
}

async function submitLogin(email: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('メールアドレス'), email);
  await user.type(screen.getByLabelText('パスワード'), 'password123');
  await user.click(screen.getByRole('button', { name: 'ログイン' }));
}

// 保護APIが401を返し、セッション切れとして扱われる状況を再現する(apiClientは実物)。
// 401の後の再確認(/me)でも、ログインしていない結果を返す。
async function expireSession() {
  vi.mocked(fetchMe).mockResolvedValueOnce(null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }),
  ));
  await act(async () => {
    await apiFetch('/api/job-postings/status-summary');
  });
}

beforeEach(() => {
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [],
    page: 0,
    size: 5,
    totalElements: 0,
    totalPages: 0,
    first: true,
    last: true,
  });
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0,
    applied: 0,
    interviewing: 0,
    offered: 0,
    rejected: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('アカウント表示とログアウト', () => {
  test('ログイン後の画面上部にメールアドレスとログアウトボタンを表示する', async () => {
    vi.mocked(fetchMe).mockResolvedValue(userA);

    renderApp('/');

    expect(await screen.findByText('user-a@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeEnabled();
  });

  test('ログアウトすると戻り先なしでログイン画面へ行き、ログアウトの案内を表示する', async () => {
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(null);
    vi.mocked(logout).mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderApp('/job-postings/new?source=a');
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    // 次の利用者を前の利用者の画面へ戻さない。
    expect(screen.getByTestId('location-state').textContent).toBe('null');
    expect(screen.getByText('ログアウトしました。')).toBeInTheDocument();
  });

  test('ログアウトのリクエスト中はボタンが無効になり二重に送らない', async () => {
    const response = deferred<void>();
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(null);
    vi.mocked(logout).mockReturnValue(response.promise);
    const user = userEvent.setup();

    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));
    const button = screen.getByRole('button', { name: 'ログアウト中…' });

    expect(button).toBeDisabled();
    await user.click(button);
    expect(logout).toHaveBeenCalledTimes(1);

    await act(async () => {
      response.resolve();
    });
    await waitFor(() => expect(currentLocation()).toBe('/login'));
  });

  test.each([
    {
      name: 'サーバーが拒否(4xx)',
      failure: () => new ApiError('リクエストを確認できませんでした。ページを再読み込みしてから、再度お試しください。', 403, 'CSRF_TOKEN_INVALID'),
      message: 'リクエストを確認できませんでした。',
    },
    {
      name: '応答がなくまだログイン状態',
      failure: () => new TypeError('Failed to fetch'),
      message: 'ログアウトできませんでした。',
    },
  ])('$name: ログアウトできないと画面に留まり失敗を伝える', async ({ failure, message }) => {
    // 確認(/me)でも、まだユーザーAのままだった場合。
    vi.mocked(fetchMe).mockResolvedValue(userA);
    vi.mocked(logout).mockRejectedValue(failure());
    const user = userEvent.setup();

    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(currentLocation()).toBe('/');
    expect(screen.getByText('user-a@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeEnabled();
  });

  test('ログアウト後に別のユーザーがログインすると/へ行く', async () => {
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(null);
    vi.mocked(logout).mockResolvedValue(undefined);
    vi.mocked(login).mockResolvedValue(userB);
    const user = userEvent.setup();

    renderApp('/job-postings/new');
    await user.click(await screen.findByRole('button', { name: 'ログアウト' }));
    await waitFor(() => expect(currentLocation()).toBe('/login'));
    await submitLogin(userB.email);

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
  });
});

describe('ユーザーの切り替わり', () => {
  test('AからBへ直接変わると画面を作り直し、Aの検索条件が入ったURLを初期化する', async () => {
    // ログアウトの応答がなく、確認すると別のタブでBがログインしていた場合(AからBへ直接切り替わる)。
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);
    vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    renderApp('/?keyword=A-private');
    const searchBox = await screen.findByLabelText('検索キーワード');
    // Aの画面は、URLの検索語で一覧を取得している。
    await waitFor(() => expect(vi.mocked(fetchJobPostings).mock.calls.map(([keyword]) => keyword))
      .toContain('A-private'));
    // まだ検索していない入力中の内容。
    await user.clear(searchBox);
    await user.type(searchBox, 'A-typing');
    vi.mocked(fetchJobPostings).mockClear();

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('検索キーワード')).toHaveValue('');
    // Bの画面は、Aの検索語を使わずに取得し直す。
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalled());
    expect(vi.mocked(fetchJobPostings).mock.calls.every(([keyword]) => keyword === '')).toBe(true);
  });

  // URLを初期化する移動が起きない場合(すでに / にいる場合)でも、画面は作り直す。
  test('すでに/にいるときAからBへ変わっても、入力中の内容を残さず画面を作り直す', async () => {
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);
    vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    renderApp('/');
    await user.type(await screen.findByLabelText('検索キーワード'), 'A-typing');
    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
    expect(currentLocation()).toBe('/');
    expect(screen.getByLabelText('検索キーワード')).toHaveValue('');
  });

  test('Aのセッション切れの後にBがログインすると、Aの戻り先ではなく/へ行く', async () => {
    vi.mocked(fetchMe).mockResolvedValue(userA);
    vi.mocked(login).mockResolvedValue(userB);

    renderApp('/?keyword=A-private');
    await screen.findByText('user-a@example.com');
    await expireSession();
    await waitFor(() => expect(currentLocation()).toBe('/login'));
    await submitLogin(userB.email);

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
  });

  test('Aのセッション切れの後にAが再ログインすると元のパスへ戻る', async () => {
    vi.mocked(fetchMe).mockResolvedValue(userA);
    vi.mocked(login).mockResolvedValue(userA);

    renderApp('/job-postings/new?source=a');
    await screen.findByText('user-a@example.com');
    await expireSession();
    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(screen.getByText('セッションの有効期限が切れました。再度ログインしてください。')).toBeInTheDocument();
    await submitLogin(userA.email);

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=a'));
  });

  describe('ログイン画面の再読み込み', () => {
    // Aのセッションが切れてログイン画面に移った後、その画面を再読み込みする。
    // 戻り先(location.state)はブラウザの履歴に残るため、再読み込み後もそのまま渡される。
    async function reloadLoginAfterExpiry(path: string) {
      vi.mocked(fetchMe).mockResolvedValue(userA);
      renderApp(path);
      await screen.findByText('user-a@example.com');
      await expireSession();
      await waitFor(() => expect(currentLocation()).toBe('/login'));
      const state: unknown = JSON.parse(screen.getByTestId('location-state').textContent ?? 'null');

      cleanup();
      switchAuthContext(null);
      vi.mocked(fetchMe).mockReset().mockResolvedValue(null);
      renderApp({ pathname: '/login', state });
      await screen.findByLabelText('メールアドレス');
    }

    afterEach(() => {
      vi.restoreAllMocks();
      sessionStorage.clear();
    });

    test('Aのセッション切れの後に再読み込みしてBがログインしても、Aの戻り先ではなく/へ行く', async () => {
      await reloadLoginAfterExpiry('/?keyword=A-private');
      vi.mocked(login).mockResolvedValue(userB);

      await submitLogin(userB.email);

      await waitFor(() => expect(currentLocation()).toBe('/'));
      expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
      expect(screen.getByLabelText('検索キーワード')).toHaveValue('');
    });

    test('Aのセッション切れの後に再読み込みしてAが再ログインすると元のパスへ戻る', async () => {
      await reloadLoginAfterExpiry('/job-postings/new?source=a');
      vi.mocked(login).mockResolvedValue(userA);

      await submitLogin(userA.email);

      await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=a'));
    });

    test('sessionStorageを使えなくてもログインとユーザーの切り替えは動作する', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);
      vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
      const user = userEvent.setup();

      renderApp('/?keyword=A-private');
      await user.click(await screen.findByRole('button', { name: 'ログアウト' }));

      // 再読み込みをまたがない切り替わりは、今まで通り検出する。
      await waitFor(() => expect(currentLocation()).toBe('/'));
      expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
    });
  });
});

describe('他のタブでの変更', () => {
  // 他のタブがログイン・ログアウトしたときに届くstorageイベントを再現する。
  function signalFromOtherTab() {
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'joblens.auth-changed',
        newValue: `other-tab-${Math.random()}`,
        storageArea: localStorage,
      }));
    });
  }

  test('別のタブでログアウトすると、確認の間は画面を隠し、戻り先なしでログイン画面へ行く', async () => {
    const me = deferred<null>();
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockReturnValueOnce(me.promise);

    renderApp('/job-postings/new?source=a');
    await screen.findByText('user-a@example.com');
    signalFromOtherTab();

    // 確認が終わるまで、前のユーザーの画面では操作できない。
    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(screen.queryByRole('heading', { name: '求人登録' })).not.toBeInTheDocument();

    await act(async () => {
      me.resolve(null);
    });
    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(screen.getByTestId('location-state').textContent).toBe('null');
    expect(screen.getByText('別のタブでログアウトしました。')).toBeInTheDocument();
  });

  test('別のタブでBとしてログインすると、AのURLを初期化してBの画面に変わる', async () => {
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);

    renderApp('/?keyword=A-private');
    await screen.findByText('user-a@example.com');
    signalFromOtherTab();

    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
    expect(screen.queryByText('user-a@example.com')).not.toBeInTheDocument();
    expect(screen.getByLabelText('検索キーワード')).toHaveValue('');
  });
});
