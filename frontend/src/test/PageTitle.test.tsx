import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { TestAuthProvider } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { AuthState } from '../auth/authContext';
import type { JobPosting } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const jobPosting: JobPosting = {
  id: 5,
  companyName: '秘密の転職先株式会社',
  title: '見られたくない職種',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

const AUTHENTICATED: AuthState = { status: 'authenticated', user: { id: 1, email: 'test-user@example.com' } };
const ANONYMOUS = { status: 'anonymous' } as AuthState;

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
}

function renderAt(url: string, state: AuthState = AUTHENTICATED) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <TestAuthProvider state={state}>
        <App />
      </TestAuthProvider>
      <BackButton />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const titles = () => Array.from(document.querySelectorAll('title')).map((title) => title.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [{ ...jobPosting, fixedOvertime: null }],
    page: 0, size: 5, totalElements: 1, totalPages: 1, first: true, last: true,
  });
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue({
    fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
    skills: [],
  });
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('画面ごとのページタイトル', () => {
  test.each<[string, string, AuthState]>([
    ['/login', 'ログイン | JobLens Japan', ANONYMOUS],
    ['/signup', '会員登録 | JobLens Japan', ANONYMOUS],
    ['/', '求人一覧 | JobLens Japan', AUTHENTICATED],
    ['/job-postings/new', '求人の登録 | JobLens Japan', AUTHENTICATED],
    ['/job-postings/5', '求人の詳細 | JobLens Japan', AUTHENTICATED],
    ['/account', 'アカウント設定 | JobLens Japan', AUTHENTICATED],
    ['/no-such-page', 'ページが見つかりません | JobLens Japan', AUTHENTICATED],
  ])('%sは「%s」', async (url, expected, state) => {
    renderAt(url, state);

    await waitFor(() => expect(document.title).toBe(expected));
    expect(titles()).toEqual([expected]);
  });

  test('見つからない求人は「求人が見つかりません」', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(
      new ApiError('求人が見つかりません。', 404, 'JOB_POSTING_NOT_FOUND'),
    );
    renderAt('/job-postings/5');

    await waitFor(() => expect(document.title).toBe('求人が見つかりません | JobLens Japan'));
    expect(titles()).toEqual(['求人が見つかりません | JobLens Japan']);
  });
});

describe('ページタイトルに載せない情報', () => {
  // ブラウザの履歴や入力候補はログアウト後も残り、共用のパソコンでは応募先が分かってしまうため。
  test('詳細画面のタイトルに、求人のタイトルと会社名を載せない', async () => {
    renderAt('/job-postings/5');

    await screen.findByRole('heading', { level: 2, name: jobPosting.title });
    expect(document.title).not.toContain(jobPosting.title);
    expect(document.title).not.toContain('秘密の転職先');
  });

  test('一覧のタイトルに検索語を載せない', async () => {
    renderAt('/?keyword=秘密の転職先');

    await screen.findByRole('heading', { level: 2, name: jobPosting.title });
    expect(document.title).toBe('求人一覧 | JobLens Japan');
  });
});

test('画面を移ると、タイトルも移った画面のものだけになる', async () => {
  const user = renderAt('/');
  await waitFor(() => expect(document.title).toBe('求人一覧 | JobLens Japan'));

  await user.click(await screen.findByRole('link', { name: jobPosting.title }));
  await screen.findByRole('heading', { level: 2, name: jobPosting.title });
  expect(document.title).toBe('求人の詳細 | JobLens Japan');
  expect(titles()).toEqual(['求人の詳細 | JobLens Japan']);

  await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));
  await waitFor(() => expect(document.title).toBe('求人一覧 | JobLens Japan'));
  expect(titles()).toEqual(['求人一覧 | JobLens Japan']);
});
