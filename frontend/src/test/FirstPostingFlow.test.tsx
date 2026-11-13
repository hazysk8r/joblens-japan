import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import {
  createJobPosting,
  deleteJobPosting,
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting, ListedJobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const CREATED = '求人を登録しました。';
const DELETED = '求人を削除しました。';
const FIRST_USE = 'まだ求人が登録されていません。';
const NO_RESULTS = '検索結果はありません。';

const created: JobPosting = {
  id: 9,
  companyName: '東京テック',
  title: '登録した求人',
  sourceUrl: null,
  originalText: '給与\n固定残業代40時間分を含む',
  createdAt: '2026-11-13T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

function pageOf(...content: ListedJobPosting[]): PageResponse<ListedJobPosting> {
  return {
    content, page: 0, size: 5, totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0, first: true, last: true,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>
      <button type="button" onClick={() => navigate(1)}>テスト用の進む</button>
    </>
  );
}

function renderAt(initialEntries: Parameters<typeof MemoryRouter>[0]['initialEntries']) {
  render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={(initialEntries?.length ?? 1) - 1}>
      <AuthenticatedApp />
      <LocationProbe />
      <HistoryButtons />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const location = () => screen.getByTestId('location').textContent;

// 知らせは領域を表示した後に入れるため、出ないことを確かめる前に、その時間を待つ。
const waitForNoticeTiming = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  vi.mocked(fetchJobPostings).mockResolvedValue(pageOf());
  vi.mocked(fetchJobPosting).mockResolvedValue(created);
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue({
    fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
    skills: [],
  });
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function createFromForm(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(createJobPosting).mockResolvedValue(created);
  await user.type(await screen.findByLabelText('求人タイトル'), created.title);
  fireEvent.change(screen.getByLabelText('求人原文'), { target: { value: created.originalText } });
  await user.click(screen.getByRole('button', { name: '登録' }));
}

describe('求人を登録したとき', () => {
  test('登録した求人の詳細画面へ移り、登録したことを知らせて、タイトルにフォーカスする', async () => {
    const user = renderAt(['/', '/job-postings/new']);

    await createFromForm(user);

    const heading = await screen.findByRole('heading', { level: 2, name: created.title });
    expect(location()).toBe('/job-postings/9');
    expect(await screen.findByText(CREATED)).toHaveAttribute('role', 'status');
    expect(heading).toHaveFocus();
  });

  test('戻る操作では、登録画面ではなく元の一覧に戻る', async () => {
    const user = renderAt(['/', '/job-postings/new']);
    await createFromForm(user);
    await screen.findByRole('heading', { level: 2, name: created.title });

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    await waitFor(() => expect(location()).toBe('/'));
  });

  test('知らせは一度だけで、同じ履歴に戻っても出さない', async () => {
    const user = renderAt(['/', '/job-postings/new']);
    await createFromForm(user);
    await screen.findByText(CREATED);

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));
    await waitFor(() => expect(location()).toBe('/'));
    await user.click(screen.getByRole('button', { name: 'テスト用の進む' }));

    await screen.findByRole('heading', { level: 2, name: created.title });
    expect(location()).toBe('/job-postings/9');
    await waitForNoticeTiming();
    expect(screen.queryByText(CREATED)).not.toBeInTheDocument();
  });

  test.each([
    ['知らない値', { notice: 'hacked' }],
    ['文字列でない値', { notice: { text: '<b>偽の知らせ</b>' } }],
    ['削除の知らせ', { notice: 'deleted' }],
  ])('詳細画面は%sの知らせを出さない', async (_, state) => {
    renderAt([{ pathname: '/job-postings/9', state }]);

    await screen.findByRole('heading', { level: 2, name: created.title });
    await waitForNoticeTiming();
    expect(screen.queryByText(CREATED)).not.toBeInTheDocument();
    expect(screen.queryByText(DELETED)).not.toBeInTheDocument();
    expect(screen.queryByText(/偽の知らせ/)).not.toBeInTheDocument();
  });
});

describe('求人を削除したとき', () => {
  test('一覧の検索条件のまま一覧に戻り、削除したことを知らせる', async () => {
    vi.mocked(deleteJobPosting).mockResolvedValue();
    const user = renderAt([
      '/?keyword=Java',
      { pathname: '/job-postings/9', state: { listSearch: '?keyword=Java' } },
    ]);
    await screen.findByRole('heading', { level: 2, name: created.title });

    await user.click(screen.getByRole('button', { name: /^削除/ }));

    await waitFor(() => expect(location()).toBe('/?keyword=Java'));
    expect(await screen.findByText(DELETED)).toHaveAttribute('role', 'status');
  });

  test('一覧は削除以外の知らせを出さない', async () => {
    renderAt([{ pathname: '/', state: { notice: 'created' } }]);

    await screen.findByText(FIRST_USE);
    await waitForNoticeTiming();
    expect(screen.queryByText(DELETED)).not.toBeInTheDocument();
    expect(screen.queryByText(CREATED)).not.toBeInTheDocument();
  });
});

describe('一覧が空のとき', () => {
  test.each(['/', '/?sort=companyName%2Casc', '/?page=2'])(
    '検索条件がない(%s)なら、初めての利用者に登録を案内する',
    async (url) => {
      renderAt([url]);

      expect(await screen.findByText(FIRST_USE)).toBeInTheDocument();
      expect(screen.getByText('求人票を貼り付けて登録すると、固定残業代などを自動で確認できます。'))
        .toBeInTheDocument();
      const links = screen.getAllByRole('link', { name: /求人を登録する/ });
      expect(links.some((link) => link.getAttribute('href') === '/job-postings/new')).toBe(true);
      expect(screen.queryByText(NO_RESULTS)).not.toBeInTheDocument();
    },
  );

  test.each([
    '/?keyword=Java',
    '/?status=APPLIED',
    '/?salaryMin=300000',
    '/?salaryMax=500000',
    '/?deadlineFrom=2026-12-01',
    '/?deadlineTo=2026-12-31',
  ])('検索条件がある(%s)なら、検索結果がないことを伝える', async (url) => {
    renderAt([url]);

    expect(await screen.findByText(NO_RESULTS)).toBeInTheDocument();
    expect(screen.queryByText(FIRST_USE)).not.toBeInTheDocument();
  });
});
