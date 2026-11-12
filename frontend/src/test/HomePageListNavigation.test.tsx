import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { ListedJobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const RANGE_ERROR = '締切日（以降）を締切日（以前）より後の日付にすることはできません。';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function posting(title: string): ListedJobPosting {
  return {
    id: title.length,
    companyName: '東京テック',
    title,
    sourceUrl: null,
    originalText: '求人の原文',
    createdAt: '2026-10-17T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
    fixedOvertime: null,
  };
}

const titleOfPage = (page: number) => `${page + 1}ページ目の求人`;

// 実際のサーバーと同じく、範囲外のページには空のcontentと本当のtotalPagesを返す。
function pageResponse(page: number, totalPages: number): PageResponse<ListedJobPosting> {
  const outOfRange = page >= totalPages;
  return {
    content: outOfRange ? [] : [posting(titleOfPage(page))],
    page,
    size: 5,
    totalElements: totalPages * 5,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
}

function renderHome(
  initialEntries: string[] = ['/'],
  options: { strict?: boolean } = {},
) {
  const app = (
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <AuthenticatedApp />
      <LocationProbe />
      <BackButton />
    </MemoryRouter>
  );
  render(options.strict ? <StrictMode>{app}</StrictMode> : app);
  return userEvent.setup();
}

const findPosting = (title: string) => screen.findByRole('heading', { name: title, level: 2 });
const queryPosting = (title: string) => screen.queryByRole('heading', { name: title, level: 2 });
const clickTitle = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'JobLens Japan' }));
const requestedPages = () => vi.mocked(fetchJobPostings).mock.calls.map((call) => call[2]);

async function selectCompanyNameSorting(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
  await user.selectOptions(screen.getByRole('combobox', { name: '並び替え' }), 'companyName,asc');
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
  vi.mocked(fetchJobPostings).mockImplementation(async (_keyword, _status, page) =>
    pageResponse(page, 2),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JobLens Japanを押したときの初期化', () => {
  test('一覧の取得エラーの後に押して取得に成功すると、エラーを消して一覧を表示する', async () => {
    vi.mocked(fetchJobPostings).mockRejectedValueOnce(new ApiError('一覧の取得に失敗しました', 500));
    const user = renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('一覧の取得に失敗しました');

    await clickTitle(user);

    expect(await findPosting(titleOfPage(0))).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('もう一度失敗したら、新しいエラーを表示する', async () => {
    vi.mocked(fetchJobPostings)
      .mockRejectedValueOnce(new ApiError('最初のエラー', 500))
      .mockRejectedValueOnce(new ApiError('二度目のエラー', 500));
    const user = renderHome();
    await screen.findByText('最初のエラー');

    await clickTitle(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('二度目のエラー');
    expect(screen.queryByText('最初のエラー')).not.toBeInTheDocument();
  });

  test('応答を待つ間は読み込み中を表示し、次のページへは進めない', async () => {
    const user = renderHome();
    await findPosting(titleOfPage(0));
    const pending = deferred<PageResponse<ListedJobPosting>>();
    vi.mocked(fetchJobPostings).mockReturnValueOnce(pending.promise);

    await clickTitle(user);

    expect(screen.getByText('求人を読み込み中…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();

    await act(async () => pending.resolve(pageResponse(0, 2)));
    expect(await findPosting(titleOfPage(0))).toBeInTheDocument();
  });

  test('締切日の範囲エラーは、詳細条件を開き直しても残らない', async () => {
    const user = renderHome();
    await findPosting(titleOfPage(0));
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    fireEvent.change(screen.getByLabelText('締切日（以降）'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('締切日（以前）'), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: '検索' }));
    expect(screen.getByText(RANGE_ERROR)).toBeInTheDocument();

    await clickTitle(user);
    await findPosting(titleOfPage(0));
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));

    expect(screen.queryByText(RANGE_ERROR)).not.toBeInTheDocument();
  });

});

describe('初回表示のURLのページが範囲外のとき', () => {
  test('最後の有効なページを取得して表示する', async () => {
    renderHome(['/?page=99']);

    expect(await findPosting(titleOfPage(1))).toBeInTheDocument();
    expect(requestedPages()).toEqual([99, 1]);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前へ' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
    // URLは他の補正と同じく変更しない。次の読み込みでも同じ補正が働く。
    expect(screen.getByTestId('location')).toHaveTextContent('/?page=99');
  });

  test('最後の有効なページの取得に失敗したら、エラーを表示する', async () => {
    vi.mocked(fetchJobPostings)
      .mockResolvedValueOnce(pageResponse(99, 2))
      .mockRejectedValueOnce(new ApiError('補正の取得に失敗しました', 500));
    renderHome(['/?page=99']);

    expect(await screen.findByRole('alert')).toHaveTextContent('補正の取得に失敗しました');
  });

  test('応答の前に別の取得が始まったら、古い応答では補正しない', async () => {
    const first = deferred<PageResponse<ListedJobPosting>>();
    vi.mocked(fetchJobPostings).mockReturnValueOnce(first.promise);
    const user = renderHome(['/?page=99']);

    await selectCompanyNameSorting(user);
    await findPosting(titleOfPage(0));
    await act(async () => first.resolve(pageResponse(99, 2)));

    expect(requestedPages()).toEqual([99, 0]);
    expect(queryPosting(titleOfPage(0))).toBeInTheDocument();
  });

  test('応答の前に別の取得が始まったら、古い一覧を表示しない', async () => {
    const first = deferred<PageResponse<ListedJobPosting>>();
    vi.mocked(fetchJobPostings).mockReturnValueOnce(first.promise);
    const user = renderHome(['/?page=1']);

    await selectCompanyNameSorting(user);
    await findPosting(titleOfPage(0));
    await act(async () => first.resolve(pageResponse(1, 2)));

    expect(queryPosting(titleOfPage(1))).not.toBeInTheDocument();
    expect(queryPosting(titleOfPage(0))).toBeInTheDocument();
  });

  test('StrictModeの二重実行でも、最後の有効なページを表示する', async () => {
    renderHome(['/?page=99'], { strict: true });

    expect(await findPosting(titleOfPage(1))).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(requestedPages().at(-1)).toBe(1);
  });
});

describe('並び替えを変更したとき', () => {
  test('URLのpageを消してsortを入れ、他の検索条件は残す', async () => {
    vi.mocked(fetchJobPostings).mockImplementation(async (_keyword, _status, page) =>
      pageResponse(page, 5),
    );
    const user = renderHome(['/?keyword=Java&status=APPLIED&page=2']);
    await findPosting(titleOfPage(2));

    await selectCompanyNameSorting(user);

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/?keyword=Java&status=APPLIED&sort=companyName%2Casc'),
    );
    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 0, 'companyName,asc', null, null, null, null,
    );
    expect(await findPosting(titleOfPage(0))).toBeInTheDocument();
  });

  test('pageを消しても履歴は増やさない', async () => {
    const user = renderHome(['/?keyword=Earlier', '/?keyword=Java']);
    await findPosting(titleOfPage(0));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await findPosting(titleOfPage(1));

    await selectCompanyNameSorting(user);
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/?keyword=Java&sort=companyName%2Casc'),
    );
    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/?keyword=Java'),
    );
    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/?keyword=Earlier'),
    );
  });

  test('URLにpageがなくても、履歴は増やさない', async () => {
    const user = renderHome(['/?keyword=Earlier', '/?keyword=Java']);
    await findPosting(titleOfPage(0));

    await selectCompanyNameSorting(user);
    await findPosting(titleOfPage(0));
    expect(screen.getByTestId('location').textContent).toBe('/?keyword=Java&sort=companyName%2Casc');

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/?keyword=Earlier'),
    );
  });
});
