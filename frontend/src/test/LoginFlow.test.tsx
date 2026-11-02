import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { fetchMe, login } from '../api/authApi';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthState } from '../auth/authContext';
import { TestAuthProvider } from './testAuth';

/**
 * ログイン画面と、ログインが必要な画面への移動を検証する。
 *
 * 認証状態の遷移は実際のAuthProviderを使い、通信部分(authApi・求人API)だけをmockする。
 */

vi.mock('../api/authApi');
vi.mock('../api/jobPostingApi');

const user1 = { id: 1, email: 'user1@example.com' };
const invalidCredentials = new ApiError(
  'メールアドレスまたはパスワードが正しくありません。',
  401,
  'INVALID_CREDENTIALS',
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// MemoryRouter内の現在のURLをテストから確認できるように表示する。
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search + location.hash}</div>;
}

type Entry = string | { pathname: string; state: unknown };

function renderApp(entry: Entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

// 起動時の確認を行わず、指定したログイン状態で表示する。
function renderAppWithState(state: AuthState, entry: Entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TestAuthProvider state={state}>
        <App />
      </TestAuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function currentLocation() {
  return screen.getByTestId('location').textContent;
}

async function submitLogin(email = 'user1@example.com', password = 'password123') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('メールアドレス'), email);
  await user.type(screen.getByLabelText('パスワード'), password);
  await user.click(screen.getByRole('button', { name: 'ログイン' }));
  return user;
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
  switchAuthContext(null);
});

describe('起動時のログイン状態の確認', () => {
  test('確認中はログイン画面へ移動せず読み込みを表示し、保護された画面のAPIも呼び出さない', async () => {
    const me = deferred<typeof user1 | null>();
    vi.mocked(fetchMe).mockReturnValue(me.promise);

    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(currentLocation()).toBe('/');
    expect(fetchJobPostings).not.toHaveBeenCalled();

    await act(async () => {
      me.resolve(user1);
    });
    expect(await screen.findByRole('heading', { name: '求人検索' })).toBeInTheDocument();
  });

  test('確認に失敗するとログイン画面の代わりにエラーと再試行ボタンを表示し、再試行に成功すると画面を表示する', async () => {
    vi.mocked(fetchMe)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(user1);
    const user = userEvent.setup();

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('ログイン状態を確認できませんでした');
    expect(currentLocation()).toBe('/');

    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByRole('heading', { name: '求人検索' })).toBeInTheDocument();
  });
});

describe('ログインが必要な画面', () => {
  test('未ログインでアクセスするとログイン画面へ行き、ログインするとクエリも含めた元のパスへ戻る', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp('/job-postings/new?source=mail#top');

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=mail#top'));
    expect(await screen.findByRole('heading', { name: '求人登録' })).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('user1@example.com', 'password123');
  });

  test('ログイン画面に直接アクセスしてログインすると/へ行く', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp('/login');
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  test('戻り先がサイトの外ならログイン後に/へ行く', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp({ pathname: '/login', state: { from: '//evil.com/job-postings/new' } });
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  test('ログイン済みでログイン画面にアクセスすると/へ行く', async () => {
    renderAppWithState({ status: 'authenticated', user: user1 }, '/login');

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('ログイン画面', () => {
  test('ログインに失敗するとサーバーのメッセージを表示し、ログイン画面に留まり、パスワードだけ空にする', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockRejectedValue(invalidCredentials);

    renderApp('/login');
    await submitLogin('user1@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('メールアドレスまたはパスワードが正しくありません。');
    expect(currentLocation()).toBe('/login');
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('user1@example.com');
    expect(screen.getByLabelText('パスワード')).toHaveValue('');
  });

  test('サーバーに接続できないと接続失敗の案内を表示する', async () => {
    // ログインの応答がなく、その後の確認でも未ログインだった場合。
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp('/login');
    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーに接続できませんでした');
    expect(currentLocation()).toBe('/login');
  });

  test('ログインのリクエスト中はボタンが無効になり二重に送らない', async () => {
    const response = deferred<typeof user1>();
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockReturnValue(response.promise);

    renderApp('/login');
    const user = await submitLogin();
    const button = screen.getByRole('button', { name: 'ログイン中…' });

    expect(button).toBeDisabled();
    await user.click(button);
    expect(login).toHaveBeenCalledTimes(1);

    await act(async () => {
      response.resolve(user1);
    });
    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  test('セッション切れでログイン画面に来たら期限切れの案内を表示する', async () => {
    renderAppWithState({ status: 'anonymous', reason: 'expired' }, '/');

    expect(await screen.findByText('セッションの有効期限が切れました。再度ログインしてください。')).toBeInTheDocument();
    expect(currentLocation()).toBe('/login');
  });

  test('ログイン状態の確認中はログインフォームの代わりに読み込みを表示する', () => {
    renderAppWithState({ status: 'loading' }, '/login');

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });
});
