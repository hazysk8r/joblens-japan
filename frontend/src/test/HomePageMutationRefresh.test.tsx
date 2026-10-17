import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { ApiError } from '../api/apiError';
import {
  deleteJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateApplicationStatus,
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
    companyName: '東京テック',
    title: 'Java求人',
    sourceUrl: null,
    originalText: '求人の原文',
    createdAt: '2026-10-17T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: 300000,
    salaryMax: 700000,
    applicationDeadline: '2026-12-01',
    version: 3,
    ...overrides,
  };
}

const javaPosting = posting();
const awsPosting = posting({ id: 2, title: 'AWS求人', applicationStatus: 'APPLIED' });

function pageOf(
  content: JobPosting[],
  page = 0,
  totalPages = content.length > 0 ? 1 : 0,
): PageResponse<JobPosting> {
  return {
    content,
    page,
    size: 5,
    totalElements: totalPages === 0 ? 0 : (totalPages - 1) * 5 + Math.max(content.length, 1),
    totalPages,
    first: page === 0,
    last: totalPages === 0 || page >= totalPages - 1,
  };
}

function cardFor(title: string) {
  const card = screen.getByRole('heading', { name: title, level: 2 }).closest('li');
  if (!card) {
    throw new Error(`求人カードが見つかりません: ${title}`);
  }
  return card;
}

async function renderJava(initialEntry = '/?keyword=Java') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: javaPosting.title, level: 2 });
}

async function searchAws(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole('textbox', { name: '검색어' });
  await user.clear(input);
  await user.type(input, 'AWS');
  await user.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByRole('heading', { name: awsPosting.title, level: 2 });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1,
    applied: 1,
    interviewing: 0,
    offered: 0,
    rejected: 0,
  });
  // 条件を取り違えた再取得は、そのまま別の求人として画面に現れる。
  vi.mocked(fetchJobPostings).mockImplementation(async (keyword, _status, page) =>
    pageOf([keyword === 'AWS' ? awsPosting : javaPosting], page, page + 1),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('更新完了後の一覧再取得', () => {
  test('状態変更の完了時は新しい検索の全条件とページを維持する', async () => {
    const mutation = deferred<JobPosting>();
    const user = userEvent.setup();
    vi.mocked(updateApplicationStatus).mockReturnValueOnce(mutation.promise);
    vi.mocked(fetchJobPostings).mockImplementation(async (keyword, _status, page) =>
      pageOf([keyword === 'AWS' ? awsPosting : javaPosting], page, 2),
    );
    await renderJava();
    await user.selectOptions(within(cardFor(javaPosting.title)).getByRole('combobox'), 'APPLIED');
    expect(updateApplicationStatus).toHaveBeenCalledWith(javaPosting.id, { status: 'APPLIED' }, javaPosting.version);

    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '상태' }), 'APPLIED');
    await user.selectOptions(screen.getByRole('combobox', { name: '최저 월급' }), '300000');
    await user.selectOptions(screen.getByRole('combobox', { name: '최고 월급' }), '700000');
    fireEvent.change(screen.getByLabelText('締切日（以降）'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('締切日（以前）'), { target: { value: '2026-12-31' } });
    await searchAws(user);
    await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'companyName,asc');
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('2 / 2');

    const callsBeforeCompletion = vi.mocked(fetchJobPostings).mock.calls.length;
    await act(async () => mutation.resolve(posting({ applicationStatus: 'APPLIED', version: 4 })));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(callsBeforeCompletion + 1));

    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'AWS', 'APPLIED', 1, 'companyName,asc', 300000, 700000, '2026-11-01', '2026-12-31',
    );
    expect(screen.getByRole('heading', { name: awsPosting.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: javaPosting.title })).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveValue('AWS');
    expect(screen.getByRole('combobox', { name: '상태' })).toHaveValue('APPLIED');
    expect(screen.getByRole('combobox', { name: '정렬' })).toHaveValue('companyName,asc');
    expect(screen.getByLabelText('締切日（以降）')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('締切日（以前）')).toHaveValue('2026-12-31');
  });

  test('削除待機中に検索を変えても完了後の一覧を元の条件へ戻さない', async () => {
    const mutation = deferred<void>();
    const user = userEvent.setup();
    vi.mocked(deleteJobPosting).mockReturnValueOnce(mutation.promise);
    await renderJava('/?keyword=Java&page=2');
    await user.click(within(cardFor(javaPosting.title)).getByRole('button', { name: '삭제' }));
    expect(deleteJobPosting).toHaveBeenCalledWith(javaPosting.id);

    await searchAws(user);
    const callsBeforeCompletion = vi.mocked(fetchJobPostings).mock.calls.length;
    await act(async () => mutation.resolve());
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(callsBeforeCompletion + 1));

    expect(fetchJobPostings).toHaveBeenLastCalledWith('AWS', '', 0, 'createdAt,desc', null, null, null, null);
    expect(screen.getByRole('heading', { name: awsPosting.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: javaPosting.title })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveValue('AWS');
  });

  test('状態変更の競合復旧も完了時点の新しい検索条件で再取得する', async () => {
    const mutation = deferred<JobPosting>();
    const user = userEvent.setup();
    vi.mocked(updateApplicationStatus).mockReturnValueOnce(mutation.promise);
    await renderJava();
    await user.selectOptions(within(cardFor(javaPosting.title)).getByRole('combobox'), 'APPLIED');
    await searchAws(user);

    const callsBeforeCompletion = vi.mocked(fetchJobPostings).mock.calls.length;
    await act(async () => mutation.reject(new ApiError(
      '競合が発生しました。', 412, 'JOB_POSTING_VERSION_CONFLICT',
    )));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(callsBeforeCompletion + 1));

    expect(fetchJobPostings).toHaveBeenLastCalledWith('AWS', '', 0, 'createdAt,desc', null, null, null, null);
    expect(screen.getByRole('heading', { name: awsPosting.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: javaPosting.title })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('다른 화면에서 채용공고가 수정되었습니다.');
    expect(updateApplicationStatus).toHaveBeenCalledTimes(1);
  });

  test('最終ページの最後の求人を削除したら最後の有効ページを表示する', async () => {
    const previousPagePosting = posting({ id: 3, title: '前ページのJava求人' });
    const user = userEvent.setup();
    vi.mocked(fetchJobPostings).mockResolvedValueOnce(pageOf([javaPosting], 2, 3));
    await renderJava('/?keyword=Java&page=2');
    vi.mocked(fetchJobPostings).mockImplementation(async (_keyword, _status, page) =>
      page === 2 ? pageOf([], 2, 2) : pageOf([previousPagePosting], 1, 2),
    );
    vi.mocked(deleteJobPosting).mockResolvedValueOnce();

    await user.click(within(cardFor(javaPosting.title)).getByRole('button', { name: '삭제' }));

    await screen.findByRole('heading', { name: previousPagePosting.title });
    expect(fetchJobPostings).toHaveBeenLastCalledWith('Java', '', 1, 'createdAt,desc', null, null, null, null);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: javaPosting.title })).not.toBeInTheDocument();
  });

  test('削除後の検索結果がゼロ件なら追加のページ取得を行わない', async () => {
    const user = userEvent.setup();
    await renderJava();
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf([]));
    vi.mocked(deleteJobPosting).mockResolvedValueOnce();
    const callsBeforeDeletion = vi.mocked(fetchJobPostings).mock.calls.length;

    await user.click(within(cardFor(javaPosting.title)).getByRole('button', { name: '삭제' }));

    await screen.findByText('검색 결과가 없습니다.');
    expect(fetchJobPostings).toHaveBeenCalledTimes(callsBeforeDeletion + 1);
    expect(fetchJobPostings).toHaveBeenLastCalledWith('Java', '', 0, 'createdAt,desc', null, null, null, null);
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
  });

  test.each([
    ['状態変更', 'status'],
    ['削除', 'delete'],
  ] as const)('%s後の再取得が遅れても後から開始した検索結果を上書きしない', async (_label, kind) => {
    const refresh = deferred<PageResponse<JobPosting>>();
    const newerSearch = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderJava();
    vi.mocked(fetchJobPostings)
      .mockReturnValueOnce(refresh.promise)
      .mockReturnValueOnce(newerSearch.promise);
    vi.mocked(updateApplicationStatus).mockResolvedValueOnce(posting({ version: 4 }));
    vi.mocked(deleteJobPosting).mockResolvedValueOnce();

    if (kind === 'status') {
      await user.selectOptions(within(cardFor(javaPosting.title)).getByRole('combobox'), 'APPLIED');
    } else {
      await user.click(within(cardFor(javaPosting.title)).getByRole('button', { name: '삭제' }));
    }
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    const input = screen.getByRole('textbox', { name: '검색어' });
    await user.clear(input);
    await user.type(input, 'AWS');
    await user.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(3));

    // 新しい検索を先に完了し、更新後の古い一覧を最後に返す。
    await act(async () => newerSearch.resolve(pageOf([awsPosting])));
    await screen.findByRole('heading', { name: awsPosting.title });
    await act(async () => refresh.resolve(pageOf([javaPosting])));

    expect(fetchJobPostings).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('heading', { name: awsPosting.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: javaPosting.title })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveValue('AWS');
  });
});
