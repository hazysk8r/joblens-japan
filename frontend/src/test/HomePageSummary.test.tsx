import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { ApplicationStatusSummaryResponse, ListedJobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const jobPosting: ListedJobPosting = {
  id: 1,
  companyName: '東京テック',
  title: 'Java求人',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-10-18T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: 300000,
  salaryMax: 700000,
  applicationDeadline: '2026-12-01',
  version: 3,
  fixedOvertime: null,
};

const page: PageResponse<ListedJobPosting> = {
  content: [jobPosting],
  page: 0,
  size: 5,
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true,
};

const initialSummary: ApplicationStatusSummaryResponse = {
  saved: 5,
  applied: 2,
  interviewing: 1,
  offered: 0,
  rejected: 0,
};

const refreshedSummary: ApplicationStatusSummaryResponse = {
  ...initialSummary,
  saved: 4,
  applied: 3,
};

function renderHome(strict = false) {
  const app = (
    <MemoryRouter>
      <AuthenticatedApp />
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{app}</StrictMode> : app);
}

function summarySection() {
  const section = screen.getByRole('heading', { name: '応募状況', level: 2 }).closest('section');
  if (!section) {
    throw new Error('応募状況の表示領域が見つかりません。');
  }
  return section;
}

function expectSavedCount(count: number) {
  const row = within(summarySection()).getByText('保存済み:').closest('p');
  expect(row).toHaveTextContent(`保存済み: ${count}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchJobPostings).mockResolvedValue(page);
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue(initialSummary);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('応募状況と求人一覧の独立した取得', () => {
  test('応募状況の初回取得に失敗しても求人一覧を残し集計領域だけにエラーを表示する', async () => {
    vi.mocked(fetchApplicationStatusSummary).mockRejectedValueOnce(new ApiError('集計を取得できません。', 500));
    renderHome();

    await screen.findByRole('heading', { name: jobPosting.title });
    const region = await screen.findByRole('region', { name: '応募状況' });
    expect(within(region).getByRole('alert')).toHaveTextContent('集計を取得できません。');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(within(region).getByRole('button', { name: '応募状況を再試行' })).toBeEnabled();
    expect(within(region).queryByText('保存済み:')).not.toBeInTheDocument();
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
  });

  test('応募状況の再試行は一覧を再取得せず成功時にエラーを消して集計を表示する', async () => {
    const retry = deferred<ApplicationStatusSummaryResponse>();
    const user = userEvent.setup();
    vi.mocked(fetchApplicationStatusSummary)
      .mockRejectedValueOnce(new ApiError('集計を取得できません。', 500))
      .mockReturnValueOnce(retry.promise);
    renderHome();
    await screen.findByRole('heading', { name: jobPosting.title });
    await screen.findByRole('alert');
    const retryButton = screen.getByRole('button', { name: '応募状況を再試行' });

    await user.click(retryButton);

    expect(retryButton).toBeDisabled();
    expect(within(summarySection()).getByRole('status')).toBeInTheDocument();
    expect(within(summarySection()).queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchApplicationStatusSummary).toHaveBeenCalledTimes(2);
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    await act(async () => retry.resolve(refreshedSummary));

    await waitFor(() => expectSavedCount(4));
    expect(within(summarySection()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(summarySection()).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: jobPosting.title })).toBeInTheDocument();
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
  });

  test('求人一覧だけが失敗した場合も応募状況を表示する', async () => {
    vi.mocked(fetchJobPostings).mockRejectedValueOnce(new ApiError('一覧を取得できません。', 500));
    renderHome();

    await screen.findByRole('alert');
    await screen.findByRole('heading', { name: '応募状況' });
    expectSavedCount(5);
    expect(screen.getByRole('alert')).toHaveTextContent('一覧を取得できません。');
    expect(within(summarySection()).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('応募状況が未完了でも先に取得できた求人一覧を表示する', async () => {
    const summary = deferred<ApplicationStatusSummaryResponse>();
    vi.mocked(fetchApplicationStatusSummary).mockReturnValueOnce(summary.promise);
    renderHome();

    await screen.findByRole('heading', { name: jobPosting.title });
    expect(screen.queryByText('求人を読み込み中…')).not.toBeInTheDocument();
    expect(fetchApplicationStatusSummary).toHaveBeenCalledTimes(1);
    await act(async () => summary.resolve(initialSummary));
    await screen.findByRole('heading', { name: '応募状況' });
    expectSavedCount(5);
  });

  test.each(['成功', '失敗'] as const)('StrictModeの古い初回集計の%sが最新の表示を上書きしない', async (outcome) => {
    const older = deferred<ApplicationStatusSummaryResponse>();
    const latest = deferred<ApplicationStatusSummaryResponse>();
    vi.mocked(fetchApplicationStatusSummary)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    renderHome(true);
    await waitFor(() => expect(fetchApplicationStatusSummary).toHaveBeenCalledTimes(2));
    await act(async () => latest.resolve(refreshedSummary));
    await screen.findByRole('heading', { name: '応募状況' });
    expectSavedCount(4);

    await act(async () => {
      if (outcome === '成功') {
        older.resolve(initialSummary);
      } else {
        older.reject(new ApiError('古い集計のエラー', 500));
      }
    });

    expectSavedCount(4);
    expect(within(summarySection()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(summarySection()).queryByRole('status')).not.toBeInTheDocument();
  });
});
