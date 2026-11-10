import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

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

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 1,
    companyName: '札幌クラウド',
    title: '求人A',
    sourceUrl: null,
    originalText: '求人原文',
    createdAt: '2026-10-05T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: 300000,
    salaryMax: 500000,
    applicationDeadline: '2026-12-01',
    version: 3,
    ...overrides,
  };
}

const postingA = posting();

function pageOf(...postings: JobPosting[]): PageResponse<JobPosting> {
  return {
    content: postings,
    page: 0,
    size: 5,
    totalElements: postings.length,
    totalPages: postings.length > 0 ? 1 : 0,
    first: true,
    last: true,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1,
    applied: 0,
    interviewing: 0,
    offered: 0,
    rejected: 0,
  });
});

afterEach(() => {
  cleanup();
});

describe('検索結果が0件のとき', () => {
  test('ないことを表示し、ページの移動を出さない', async () => {
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf());

    render(<MemoryRouter><AuthenticatedApp /></MemoryRouter>);

    expect(await screen.findByText('検索結果はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
  });
});

describe('一覧取得の経路の応答順序', () => {
  test('初回取得がpendingでも新しいPOPの応答が表示され、読み込み状態が終わる', async () => {
    const initial = deferred<PageResponse<JobPosting>>();
    const history = deferred<PageResponse<JobPosting>>();
    function HistoryControl() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
    }
    const user = userEvent.setup();
    vi.mocked(fetchJobPostings)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(history.promise);
    render(
      <MemoryRouter initialEntries={['/?keyword=AWS', '/?keyword=Java']} initialIndex={1}>
        <AuthenticatedApp />
        <HistoryControl />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    await act(async () => history.resolve(pageOf(posting({ title: '戻る操作の最新結果' }))));

    expect(screen.getByRole('heading', { name: '戻る操作の最新結果', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '検索' })).toBeEnabled();
    expect(screen.queryByText('求人を読み込み中…')).not.toBeInTheDocument();
    await act(async () => initial.resolve(pageOf(posting({ title: '遅い初期結果' }))));
    expect(screen.getByRole('heading', { name: '戻る操作の最新結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い初期結果', level: 2 })).not.toBeInTheDocument();
  });

  test('初回取得が遅れて終わっても最新の並び替え結果を上書きしない', async () => {
    const initial = deferred<PageResponse<JobPosting>>();
    const sorted = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    vi.mocked(fetchJobPostings).mockReturnValueOnce(initial.promise).mockReturnValueOnce(sorted.promise);
    render(<MemoryRouter><AuthenticatedApp /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '並び替え' }), 'companyName,asc');
    await act(async () => sorted.resolve(pageOf(posting({ title: '最新の並べ替え結果' }))));
    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    await act(async () => initial.resolve(pageOf(posting({ title: '遅い初期結果' }))));

    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い初期結果', level: 2 })).not.toBeInTheDocument();
  });

  test('POPの取得が遅れて終わっても、その後の並び替え結果を上書きしない', async () => {
    const history = deferred<PageResponse<JobPosting>>();
    const sorted = deferred<PageResponse<JobPosting>>();
    function HistoryControl() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
    }
    const user = userEvent.setup();
    vi.mocked(fetchJobPostings)
      .mockResolvedValueOnce(pageOf(postingA))
      .mockReturnValueOnce(history.promise)
      .mockReturnValueOnce(sorted.promise);
    render(
      <MemoryRouter initialEntries={['/?keyword=AWS', '/?keyword=Java']} initialIndex={1}>
        <AuthenticatedApp />
        <HistoryControl />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: postingA.title, level: 2 });
    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '並び替え' }), 'companyName,asc');
    await act(async () => sorted.resolve(pageOf(posting({ title: '最新の並べ替え結果' }))));
    await act(async () => history.resolve(pageOf(posting({ title: '遅い履歴結果' }))));

    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い履歴結果', level: 2 })).not.toBeInTheDocument();
  });
});
