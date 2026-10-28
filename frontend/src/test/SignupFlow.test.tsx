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
  test('가입하면 로그인 상태가 되어 돌아갈 경로(쿼리 포함)로 이동한다', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp({ pathname: '/signup', state: { from: '/job-postings/new?source=mail' } });
    await fillAndSubmit();

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=mail'));
    expect(await screen.findByRole('heading', { name: '求人登録' })).toBeInTheDocument();
  });

  test('이메일은 앞뒤 공백을 제거하고, 비밀번호는 그대로 전달한다', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp();
    await fillAndSubmit({ email: '  new@example.com  ', password: ' pass word ' });

    await waitFor(() => expect(signup).toHaveBeenCalledWith('new@example.com', ' pass word '));
  });

  test('돌아갈 경로가 사이트 밖이면 가입 후 / 로 간다', async () => {
    vi.mocked(signup).mockResolvedValue(newUser);

    renderApp({ pathname: '/signup', state: { from: '//evil.com/job-postings/new' } });
    await fillAndSubmit();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('入力チェック(クライアント)', () => {
  test.each([
    { name: '이메일 없음', input: { email: '' }, label: 'メールアドレス' },
    { name: '비밀번호 7자', input: { password: 'a'.repeat(7) }, label: 'パスワード' },
    { name: '공백만인 비밀번호', input: { password: ' '.repeat(10) }, label: 'パスワード' },
    { name: '한글 25자(75바이트)', input: { password: '가'.repeat(25) }, label: 'パスワード' },
    { name: '확인 불일치', input: { passwordConfirmation: 'password124' }, label: 'パスワード（確認）' },
  ])('$name: 요청을 보내지 않고 해당 칸에 오류를 표시한다', async ({ input, label }) => {
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
  test('400 필드 오류는 각 입력칸에 표시하고 입력값을 유지한다', async () => {
    vi.mocked(signup).mockRejectedValue(new ApiError('입력값이 올바르지 않습니다.', 400, 'VALIDATION_FAILED', {
      email: '이메일 형식이 올바르지 않습니다.',
    }));

    renderApp();
    await fillAndSubmit({ email: 'not-an-email' });

    await waitFor(() => expect(fieldErrorOf('メールアドレス')).toBe('이메일 형식이 올바르지 않습니다.'));
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');
    expect(currentLocation()).toBe('/signup');
  });

  // 画面にない項目のエラーだけが返ると、どこにも表示されず「押しても何も起きない」状態になる。
  test.each<{ name: string; fieldErrors: Record<string, string>; emailError: string | null }>([
    {
      name: '화면에 없는 항목의 오류만 있는 경우',
      fieldErrors: { agreedToTerms: '이용약관에 동의해주세요.' },
      emailError: null,
    },
    {
      name: '화면에 있는 항목과 없는 항목의 오류가 섞인 경우',
      fieldErrors: { email: '이메일 형식이 올바르지 않습니다.', agreedToTerms: '이용약관에 동의해주세요.' },
      emailError: '이메일 형식이 올바르지 않습니다.',
    },
  ])('$name: 폼 아래에 일반 안내를 표시하고, 화면에 없는 항목의 메시지는 표시하지 않는다', async ({ fieldErrors, emailError }) => {
    vi.mocked(signup).mockRejectedValue(
      new ApiError('입력값이 올바르지 않습니다.', 400, 'VALIDATION_FAILED', fieldErrors),
    );

    renderApp();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('입력값이 올바르지 않습니다.');
    expect(screen.queryByText('이용약관에 동의해주세요.')).not.toBeInTheDocument();
    expect(fieldErrorOf('メールアドレス')).toBe(emailError);
  });

  test('이미 가입된 이메일(409)이면 이메일 칸에 표시하고, 돌아갈 경로를 유지한 로그인 링크를 보여 준다', async () => {
    vi.mocked(signup).mockRejectedValue(new ApiError('이미 가입된 이메일입니다.', 409, 'EMAIL_ALREADY_EXISTS'));

    renderApp({ pathname: '/signup', state: { from: '/job-postings/new' } });
    const user = await fillAndSubmit();

    await waitFor(() => expect(fieldErrorOf('メールアドレス')).toContain('이미 가입된 이메일입니다.'));
    // パスワードは新しく決めている途中のため、失敗しても消さない。
    expect(screen.getByLabelText('パスワード')).toHaveValue('password123');

    const emailError = document.getElementById(
      screen.getByLabelText('メールアドレス').getAttribute('aria-describedby')!,
    )!;
    await user.click(within(emailError).getByRole('link', { name: 'ログイン画面へ' }));

    expect(currentLocation()).toBe('/login');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
  });

  test('서버에 연결하지 못하면 연결 실패 안내를 표시하고 화면에 머문다', async () => {
    vi.mocked(signup).mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp();
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーに接続できませんでした');
    expect(currentLocation()).toBe('/signup');
  });
});

describe('送信中', () => {
  test('요청 중에는 버튼이 비활성화되어 두 번 보내지 않는다', async () => {
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
  test('로그인 상태를 확인하는 중에는 폼 대신 로딩을 표시한다', () => {
    renderAppWithState({ status: 'loading' });

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  test('로그인 상태 확인에 실패하면 폼 대신 오류와 재시도 버튼을 표시한다', () => {
    renderAppWithState({ status: 'error' });

    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  test('이미 로그인한 상태로 접근하면 / 로 간다', async () => {
    renderAppWithState({ status: 'authenticated', user: newUser });

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('ログイン画面との行き来', () => {
  test('로그인 화면의 회원가입 링크로 이동하면 돌아갈 경로를 유지한다', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/login', state: { from: '/job-postings/new' } });

    await user.click(await screen.findByRole('link', { name: '会員登録' }));

    expect(currentLocation()).toBe('/signup');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
    expect(screen.getByRole('heading', { name: '会員登録' })).toBeInTheDocument();
  });

  test('회원가입 화면의 로그인 링크로 이동하면 돌아갈 경로를 유지한다', async () => {
    const user = userEvent.setup();
    renderApp({ pathname: '/signup', state: { from: '/job-postings/new' } });

    await user.click(await screen.findByRole('link', { name: 'ログイン' }));

    expect(currentLocation()).toBe('/login');
    expect(currentState()).toBe(JSON.stringify({ from: '/job-postings/new' }));
  });
});
