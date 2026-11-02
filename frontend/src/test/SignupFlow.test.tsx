import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { ApiError } from '../api/apiError';
import { fetchMe, signup } from '../api/authApi';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthState } from '../auth/authContext';
import { TestAuthProvider } from './testAuth';

/**
 * 会員登録画面を検証する。
 *
 * 認証状態の遷移は実際のAuthProviderを使い、通信部分(authApi・求人API)だけをmockする。
 * 実際に送るリクエストの形式は authApi.test.ts、画面から通信までのつながりは AuthSeam.test.tsx で確認する。
 */

vi.mock('../api/authApi');
vi.mock('../api/jobPostingApi');

const newUser = { id: 11, email: 'new@example.com' };

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

type Entry = string | { pathname: string; state: unknown };

function renderApp(entry: Entry = '/signup') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function renderAppWithState(state: AuthState, entry: Entry = '/signup') {
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

function currentState() {
  return screen.getByTestId('location-state').textContent;
}

async function fillAndSubmit({
  email = 'new@example.com',
  password = 'password123',
  passwordConfirmation = password,
}: { email?: string; password?: string; passwordConfirmation?: string } = {}) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('メールアドレス'), email);
  if (password) await user.type(screen.getByLabelText('パスワード'), password);
  if (passwordConfirmation) await user.type(screen.getByLabelText('パスワード（確認）'), passwordConfirmation);
  await user.click(screen.getByRole('button', { name: '登録する' }));
  return user;
}

// 入力欄に結び付いたエラーメッセージ(aria-describedby)を返す。
function fieldErrorOf(label: string): string | null {
  const input = screen.getByLabelText(label);
  const describedBy = input.getAttribute('aria-describedby');
  return describedBy ? document.getElementById(describedBy)?.textContent ?? null : null;
}

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue(null);
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

describe('会員登録の成功', () => {
  test('登録するとログイン状態になり、戻り先(クエリを含む)へ移動する', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp({ pathname: '/signup', state: { from: '/job-postings/new?source=mail' } });
    await fillAndSubmit();

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=mail'));
    expect(await screen.findByRole('heading', { name: '求人登録' })).toBeInTheDocument();
  });

  test('メールアドレスは前後の空白を除き、パスワードはそのまま渡す', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp();
    await fillAndSubmit({ email: '  new@example.com  ', password: ' pass word ' });

    await waitFor(() => expect(signup).toHaveBeenCalledWith('new@example.com', ' pass word '));
  });

  test('戻り先がサイトの外なら登録後に/へ行く', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp({ pathname: '/signup', state: { from: '//evil.com/job-postings/new' } });
    await fillAndSubmit();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('入力チェック(クライアント)', () => {
  test.each([
    { name: 'メールアドレスなし', input: { email: '' }, label: 'メールアドレス' },
    { name: 'パスワード7文字', input: { password: 'a'.repeat(7) }, label: 'パスワード' },
    { name: '空白だけのパスワード', input: { password: ' '.repeat(10) }, label: 'パスワード' },
    { name: '日本語25文字(75バイト)', input: { password: 'あ'.repeat(25) }, label: 'パスワード' },
    { name: '確認の不一致', input: { passwordConfirmation: 'password124' }, label: 'パスワード（確認）' },
  ])('$name: リクエストを送らず該当の欄にエラーを表示する', async ({ input, label }) => {
    renderApp();
    // メールアドレスを空にする場合は、入力を省略する。
    const user = userEvent.setup();
    if (input.email !== '') await user.type(await screen.findByLabelText('メールアドレス'), 'new@example.com');
    const password = input.password ?? 'password123';
    await user.type(await screen.findByLabelText('パスワード'), password);
    await user.type(screen.getByLabelText('パスワード（確認）'), input.passwordConfirmation ?? password);
    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(signup).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    expect(fieldErrorOf(label)).toBeTruthy();
  });
});

describe('サーバーが返した失敗', () => {
  test('400の項目エラーは各入力欄に表示し、入力値を維持する', async () => {
    vi.mocked(signup).mockRejectedValue(new ApiError('入力値が正しくありません。', 400, 'VALIDATION_FAILED', {
      email: 'メールアドレスの形式が正しくありません。',
    }));

    renderApp();
    await fillAndSubmit({ email: 'not-an-email' });

    await waitFor(() => expect(fieldErrorOf('メールアドレス')).toBe('メールアドレスの形式が正しくありません。'));
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');
    expect(currentLocation()).toBe('/signup');
  });

  // 画面にない項目のエラーだけが返ると、どこにも表示されず「押しても何も起きない」状態になる。
  test.each<{ name: string; fieldErrors: Record<string, string>; emailError: string | null }>([
    {
      name: '画面にない項目のエラーだけがある場合',
      fieldErrors: { agreedToTerms: '利用規約に同意してください。' },
      emailError: null,
    },
    {
      name: '画面にある項目とない項目のエラーが混在する場合',
      fieldErrors: { email: 'メールアドレスの形式が正しくありません。', agreedToTerms: '利用規約に同意してください。' },
      emailError: 'メールアドレスの形式が正しくありません。',
    },
  ])('$name: フォームの下に全体の案内を表示し、画面にない項目のメッセージは表示しない', async ({ fieldErrors, emailError }) => {
    vi.mocked(signup).mockRejectedValue(
      new ApiError('入力値が正しくありません。', 400, 'VALIDATION_FAILED', fieldErrors),
    );

    renderApp();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('入力値が正しくありません。');
    expect(screen.queryByText('利用規約に同意してください。')).not.toBeInTheDocument();
    expect(fieldErrorOf('メールアドレス')).toBe(emailError);
  });

  test('登録済みのメールアドレス(409)ならメール欄に表示し、戻り先を維持したログインリンクを表示する', async () => {
    vi.mocked(signup).mockRejectedValue(new ApiError('このメールアドレスはすでに登録されています。', 409, 'EMAIL_ALREADY_EXISTS'));

    renderApp({ pathname: '/signup', state: { from: '/job-postings/new' } });
    const user = await fillAndSubmit();

    await waitFor(() => expect(fieldErrorOf('メールアドレス')).toContain('このメールアドレスはすでに登録されています。'));
    // パスワードは新しく決めている途中のため、失敗しても消さない。
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');

    const emailError = document.getElementById(
      screen.getByLabelText('メールアドレス').getAttribute('aria-describedby')!,
    )!;
    await user.click(within(emailError).getByRole('link', { name: 'ログイン画面へ' }));

    expect(currentLocation()).toBe('/login');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
  });

  test('サーバーに接続できないと接続失敗の案内を表示し、画面に留まる', async () => {
    vi.mocked(signup).mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーに接続できませんでした');
    expect(currentLocation()).toBe('/signup');
  });
});

describe('送信中', () => {
  test('リクエスト中はボタンが無効になり二重に送らない', async () => {
    const response = deferred<typeof newUser>();
    vi.mocked(signup).mockReturnValue(response.promise);

    renderApp();
    const user = await fillAndSubmit();
    const button = screen.getByRole('button', { name: '登録中…' });

    expect(button).toBeDisabled();
    await user.click(button);
    expect(signup).toHaveBeenCalledTimes(1);

    await act(async () => {
      response.resolve(newUser);
    });
    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('ログイン状態による表示', () => {
  test('ログイン状態の確認中はフォームの代わりに読み込みを表示する', () => {
    renderAppWithState({ status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  test('ログイン状態の確認に失敗するとフォームの代わりにエラーと再試行ボタンを表示する', () => {
    renderAppWithState({ status: 'error' });

    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  test('ログイン済みでアクセスすると/へ行く', async () => {
    renderAppWithState({ status: 'authenticated', user: newUser });

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('ログイン画面との行き来', () => {
  test('ログイン画面の会員登録リンクで移動すると戻り先を維持する', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/login', state: { from: '/job-postings/new' } });

    await user.click(await screen.findByRole('link', { name: '会員登録' }));

    expect(currentLocation()).toBe('/signup');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
    expect(screen.getByRole('heading', { name: '会員登録' })).toBeInTheDocument();
  });

  test('会員登録画面のログインリンクで移動すると戻り先を維持する', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/signup', state: { from: '/job-postings/new' } });

    await user.click(await screen.findByRole('link', { name: 'ログイン' }));

    expect(currentLocation()).toBe('/login');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
  });
});
