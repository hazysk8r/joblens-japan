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
  '이메일 또는 비밀번호가 올바르지 않습니다.',
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
  test('확인 중에는 로그인 화면으로 이동하지 않고 로딩을 표시하며, 보호 화면의 API도 호출하지 않는다', async () => {
    const me = deferred<typeof user1 | null>();
    vi.mocked(fetchMe).mockReturnValue(me.promise);

    renderApp('/');

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(currentLocation()).toBe('/');
    expect(fetchJobPostings).not.toHaveBeenCalled();

    await act(async () => {
      me.resolve(user1);
    });
    expect(await screen.findByRole('heading', { name: '채용공고 검색' })).toBeInTheDocument();
  });

  test('확인에 실패하면 로그인 화면 대신 오류와 재시도 버튼을 표시하고, 재시도에 성공하면 화면을 표시한다', async () => {
    vi.mocked(fetchMe)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(user1);
    const user = userEvent.setup();

    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 상태를 확인하지 못했습니다');
    expect(currentLocation()).toBe('/');

    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByRole('heading', { name: '채용공고 검색' })).toBeInTheDocument();
  });
});

describe('ログインが必要な画面', () => {
  test('로그인하지 않고 접근하면 로그인 화면으로 가고, 로그인하면 쿼리까지 포함한 원래 경로로 돌아온다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp('/job-postings/new?source=mail#top');

    await waitFor(() => expect(currentLocation()).toBe('/login'));
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=mail#top'));
    expect(await screen.findByRole('heading', { name: '求人登録' })).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('user1@example.com', 'password123');
  });

  test('로그인 화면에 직접 접근해서 로그인하면 / 로 간다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp('/login');
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  test('돌아갈 경로가 사이트 밖이면 로그인 후 / 로 간다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockResolvedValue(user1);

    renderApp({ pathname: '/login', state: { from: '//evil.com/job-postings/new' } });
    await submitLogin();

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });

  test('이미 로그인한 상태로 로그인 화면에 접근하면 / 로 간다', async () => {
    renderAppWithState({ status: 'authenticated', user: user1 }, '/login');

    await waitFor(() => expect(currentLocation()).toBe('/'));
  });
});

describe('ログイン画面', () => {
  test('로그인에 실패하면 서버 메시지를 표시하고, 로그인 화면에 머물며, 비밀번호만 비운다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockRejectedValue(invalidCredentials);

    renderApp('/login');
    await submitLogin('user1@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다.');
    expect(currentLocation()).toBe('/login');
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('user1@example.com');
    expect(screen.getByLabelText('パスワード')).toHaveValue('');
  });

  test('서버에 연결하지 못하면 연결 실패 안내를 표시한다', async () => {
    // ログインの応答がなく、その後の確認でも未ログインだった場合。
    vi.mocked(fetchMe).mockResolvedValue(null);
    vi.mocked(login).mockRejectedValue(new TypeError('Failed to fetch'));

    renderApp('/login');
    await submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결하지 못했습니다');
    expect(currentLocation()).toBe('/login');
  });

  test('로그인 요청 중에는 버튼이 비활성화되어 두 번 보내지 않는다', async () => {
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

  test('세션이 만료되어 로그인 화면으로 왔으면 만료 안내를 표시한다', async () => {
    renderAppWithState({ status: 'anonymous', sessionExpired: true }, '/');

    expect(await screen.findByText('세션이 만료되었습니다. 다시 로그인해주세요.')).toBeInTheDocument();
    expect(currentLocation()).toBe('/login');
  });

  test('로그인 상태를 확인하는 중에는 로그인 폼 대신 로딩을 표시한다', () => {
    renderAppWithState({ status: 'loading' }, '/login');

    expect(screen.getByRole('status')).toHaveTextContent('ログイン状態を確認しています');
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });
});
