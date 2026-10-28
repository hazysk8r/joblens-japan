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
async function expireSession() {
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
  test('로그인한 화면 상단에 이메일과 로그아웃 버튼을 표시한다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(userA);

    renderApp('/');

    expect(await screen.findByText('user-a@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeEnabled();
  });

  test('로그아웃하면 돌아갈 경로 없이 로그인 화면으로 가고, 로그아웃 안내를 표시한다', async () => {
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

  test('로그아웃 요청 중에는 버튼이 비활성화되어 두 번 보내지 않는다', async () => {
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
      name: '서버가 거절함(4xx)',
      failure: () => new ApiError('요청을 확인할 수 없습니다. 페이지를 새로고침한 후 다시 시도해주세요.', 403, 'CSRF_TOKEN_INVALID'),
      message: '요청을 확인할 수 없습니다.',
    },
    {
      name: '응답이 없고 아직 로그인 상태',
      failure: () => new TypeError('Failed to fetch'),
      message: 'ログアウトできませんでした。',
    },
  ])('$name: 로그아웃하지 못하면 화면에 머물며 실패를 알린다', async ({ failure, message }) => {
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

  test('로그아웃 후 다른 사용자가 로그인하면 / 로 간다', async () => {
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
  test('A에서 B로 바로 바뀌면 화면을 새로 만들고, A의 검색 조건이 담긴 URL을 초기화한다', async () => {
    // ログアウトの応答がなく、確認すると別のタブでBがログインしていた場合(AからBへ直接切り替わる)。
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);
    vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    renderApp('/?keyword=A-private');
    const searchBox = await screen.findByLabelText('검색어');
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
    expect(screen.getByLabelText('검색어')).toHaveValue('');
    // Bの画面は、Aの検索語を使わずに取得し直す。
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalled());
    expect(vi.mocked(fetchJobPostings).mock.calls.every(([keyword]) => keyword === '')).toBe(true);
  });

  // URLを初期化する移動が起きない場合(すでに / にいる場合)でも、画面は作り直す。
  test('이미 / 에 있을 때 A에서 B로 바뀌어도, 입력 중이던 내용을 남기지 않고 화면을 새로 만든다', async () => {
    vi.mocked(fetchMe).mockResolvedValueOnce(userA).mockResolvedValue(userB);
    vi.mocked(logout).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    renderApp('/');
    await user.type(await screen.findByLabelText('검색어'), 'A-typing');
    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    expect(await screen.findByText('user-b@example.com')).toBeInTheDocument();
    expect(currentLocation()).toBe('/');
    expect(screen.getByLabelText('검색어')).toHaveValue('');
  });

  test('A의 세션이 만료된 뒤 B가 로그인하면 A의 돌아갈 경로가 아니라 / 로 간다', async () => {
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

  test('A의 세션이 만료된 뒤 A가 다시 로그인하면 원래 경로로 돌아간다', async () => {
    vi.mocked(fetchMe).mockResolvedValue(userA);
    vi.mocked(login).mockResolvedValue(userA);

    renderApp('/job-postings/new?source=a');
    await screen.findByText('user-a@example.com');
    await expireSession();
    await waitFor(() => expect(currentLocation()).toBe('/login'));
    expect(screen.getByText('세션이 만료되었습니다. 다시 로그인해주세요.')).toBeInTheDocument();
    await submitLogin(userA.email);

    await waitFor(() => expect(currentLocation()).toBe('/job-postings/new?source=a'));
  });
});
