import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import {
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const RANGE_ERROR = '締切日（以降）を締切日（以前）より後の日付にすることはできません。';

// すべての条件を指定した一覧のURL。並び順のカンマはURLSearchParamsで%2Cになる。
const ALL_CONDITIONS =
  '/?keyword=Java&status=APPLIED&salaryMin=300000&salaryMax=500000'
  + '&deadlineFrom=2026-12-01&deadlineTo=2026-12-31&sort=companyName%2Casc';

function posting(page: number): JobPosting {
  return {
    id: page + 1,
    companyName: '東京テック',
    title: `${page + 1}ページ目の求人`,
    sourceUrl: null,
    originalText: '求人の原文',
    createdAt: '2026-10-17T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };
}

function pageResponse(page: number): PageResponse<JobPosting> {
  return {
    content: [posting(page)],
    page,
    size: 5,
    totalElements: 10,
    totalPages: 2,
    first: page === 0,
    last: page === 1,
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

function renderHome(initialEntries: string[] = ['/']) {
  render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <AuthenticatedApp />
      <LocationProbe />
      <BackButton />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

type User = ReturnType<typeof userEvent.setup>;

const findPosting = (page: number) =>
  screen.findByRole('heading', { name: `${page + 1}ページ目の求人`, level: 2 });
const location = () => screen.getByTestId('location').textContent;
const sortingSelect = () => screen.getByRole('combobox', { name: '並び替え' });
const salaryMinSelect = () => screen.getByLabelText('最低月給', { selector: '#search-salaryMin' });
const salaryMaxSelect = () => screen.getByLabelText('最高月給', { selector: '#search-salaryMax' });
const deadlineFromInput = () => screen.getByLabelText('締切日（以降）');
const deadlineToInput = () => screen.getByLabelText('締切日（以前）');
const back = (user: User) => user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

// 画面に表示している条件。表示と取得の条件が一致することを確かめるために使う。
function shownConditions() {
  return {
    keyword: (screen.getByRole('textbox', { name: '検索キーワード' }) as HTMLInputElement).value,
    status: (screen.getByRole('combobox', { name: 'ステータス' }) as HTMLSelectElement).value,
    salaryMin: (salaryMinSelect() as HTMLSelectElement).value,
    salaryMax: (salaryMaxSelect() as HTMLSelectElement).value,
    deadlineFrom: (deadlineFromInput() as HTMLInputElement).value,
    deadlineTo: (deadlineToInput() as HTMLInputElement).value,
    sorting: (sortingSelect() as HTMLSelectElement).value,
  };
}

const NO_CONDITIONS = {
  keyword: '', status: '', salaryMin: '', salaryMax: '', deadlineFrom: '', deadlineTo: '',
  sorting: 'createdAt,desc',
};

const ALL_SHOWN = {
  keyword: 'Java', status: 'APPLIED', salaryMin: '300000', salaryMax: '500000',
  deadlineFrom: '2026-12-01', deadlineTo: '2026-12-31', sorting: 'companyName,asc',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  vi.mocked(fetchJobPostings).mockImplementation(async (_keyword, _status, page) =>
    pageResponse(Math.min(page, 1)),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('検索したとき', () => {
  test('詳細条件と並び順をURLに入れる', async () => {
    const user = renderHome();
    await findPosting(0);
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(sortingSelect(), 'companyName,asc');
    await user.selectOptions(salaryMinSelect(), '300000');
    await user.selectOptions(salaryMaxSelect(), '500000');
    fireEvent.change(deadlineFromInput(), { target: { value: '2026-12-01' } });
    fireEvent.change(deadlineToInput(), { target: { value: '2026-12-31' } });
    await user.type(screen.getByRole('textbox', { name: '検索キーワード' }), 'Java');
    await user.selectOptions(screen.getByRole('combobox', { name: 'ステータス' }), 'APPLIED');

    await user.click(screen.getByRole('button', { name: '検索' }));

    await waitFor(() => expect(location()).toBe(ALL_CONDITIONS));
    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 0, 'companyName,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    );
  });

  test('既定の並び順と指定のない条件はURLに入れない', async () => {
    const user = renderHome(['/?sort=companyName%2Casc']);
    await findPosting(0);
    await user.selectOptions(sortingSelect(), 'createdAt,desc');
    await waitFor(() => expect(location()).toBe('/'));
    await user.type(screen.getByRole('textbox', { name: '検索キーワード' }), 'Java');

    await user.click(screen.getByRole('button', { name: '検索' }));

    await waitFor(() => expect(location()).toBe('/?keyword=Java'));
  });
});

describe('URLの条件で表示を始めたとき', () => {
  test('並び替えても、他の条件は同じまま1ページ目から取得する', async () => {
    const user = renderHome([`${ALL_CONDITIONS}&page=1`]);
    await findPosting(1);

    await user.selectOptions(sortingSelect(), 'createdAt,asc');

    await waitFor(() => expect(location()).toBe(ALL_CONDITIONS.replace('companyName%2Casc', 'createdAt%2Casc')));
    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 0, 'createdAt,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    );
  });

  test('すべての条件で取得し、詳細条件を開いて同じ条件を表示する', async () => {
    renderHome([`${ALL_CONDITIONS}&page=1`]);

    await findPosting(1);
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(fetchJobPostings).toHaveBeenCalledWith(
      'Java', 'APPLIED', 1, 'companyName,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    );
    expect(screen.getByRole('button', { name: '－ 詳細条件を閉じる' })).toBeInTheDocument();
    expect(shownConditions()).toEqual(ALL_SHOWN);
  });

  test('次のページへも同じ条件で進む', async () => {
    const user = renderHome([ALL_CONDITIONS]);
    await findPosting(0);

    await user.click(screen.getByRole('button', { name: '次へ' }));

    await findPosting(1);
    expect(location()).toBe(`${ALL_CONDITIONS}&page=1`);
    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 1, 'companyName,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    );
  });

  test.each([
    'salaryMin=300000',
    'salaryMax=500000',
    'deadlineFrom=2026-12-01',
    'deadlineTo=2026-12-31',
    'sort=companyName%2Casc',
  ])('%sだけでも、詳細条件を開く', async (query) => {
    renderHome([`/?${query}`]);

    await findPosting(0);
    expect(screen.getByRole('button', { name: '－ 詳細条件を閉じる' })).toBeInTheDocument();
  });

  test('詳細条件がなければ、詳細条件は閉じたままにする', async () => {
    renderHome(['/?keyword=Java']);

    await findPosting(0);
    expect(screen.getByRole('button', { name: '＋ 詳細条件' })).toBeInTheDocument();
  });

  test.each([
    ['選択肢にない月給', 'salaryMin=310000', [null, null, null, null]],
    ['数値でない月給', 'salaryMax=abc', [null, null, null, null]],
    ['最低が最高より高い月給', 'salaryMin=500000&salaryMax=300000', [null, null, null, null]],
    ['存在しない日付', 'deadlineFrom=2026-02-30', [null, null, null, null]],
    ['形式の違う日付', 'deadlineTo=2026-1-01', [null, null, null, null]],
    ['以降が以前より後の日付', 'deadlineFrom=2026-12-31&deadlineTo=2026-12-01', [null, null, null, null]],
    ['範囲の片方だけ', 'salaryMin=300000&deadlineTo=2026-12-31', [300000, null, null, '2026-12-31']],
  ] as const)('%sは使わない', async (_, query, [salaryMin, salaryMax, deadlineFrom, deadlineTo]) => {
    renderHome([`/?${query}`]);

    await findPosting(0);
    expect(fetchJobPostings).toHaveBeenCalledWith(
      '', '', 0, 'createdAt,desc', salaryMin, salaryMax, deadlineFrom, deadlineTo,
    );
  });

  test('知らない並び順は既定の並び順にし、詳細条件も開かない', async () => {
    renderHome(['/?sort=title%2Casc']);

    await findPosting(0);
    expect(fetchJobPostings).toHaveBeenCalledWith(
      '', '', 0, 'createdAt,desc', null, null, null, null,
    );
    expect(screen.getByRole('button', { name: '＋ 詳細条件' })).toBeInTheDocument();
  });
});

describe('ブラウザで戻ったとき', () => {
  test('検索した条件で取得し、表示と一致する', async () => {
    const user = renderHome();
    await findPosting(0);
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(sortingSelect(), 'companyName,asc');
    await user.selectOptions(salaryMinSelect(), '300000');
    await user.click(screen.getByRole('button', { name: '検索' }));
    await waitFor(() => expect(location()).toBe('/?salaryMin=300000&sort=companyName%2Casc'));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await findPosting(1);

    await back(user);

    await findPosting(0);
    expect(fetchJobPostings).toHaveBeenLastCalledWith(
      '', '', 0, 'companyName,asc', 300000, null, null, null,
    );
    expect(shownConditions()).toEqual({ ...NO_CONDITIONS, salaryMin: '300000', sorting: 'companyName,asc' });
  });

  test('条件のある履歴へ戻ると、その条件を表示して詳細条件を開く', async () => {
    const user = renderHome([ALL_CONDITIONS, '/']);
    await findPosting(0);

    await back(user);

    await waitFor(() => expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 0, 'companyName,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    ));
    expect(screen.getByRole('button', { name: '－ 詳細条件を閉じる' })).toBeInTheDocument();
    expect(shownConditions()).toEqual(ALL_SHOWN);
  });

  test('条件のない履歴へ戻ると、条件を消して既定の並び順で取得する', async () => {
    const user = renderHome(['/', ALL_CONDITIONS]);
    await findPosting(0);

    await back(user);

    await waitFor(() => expect(location()).toBe('/'));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenLastCalledWith(
      '', '', 0, 'createdAt,desc', null, null, null, null,
    ));
    expect(shownConditions()).toEqual(NO_CONDITIONS);
  });

  test('締切日の範囲エラーを消す', async () => {
    const user = renderHome(['/?keyword=Earlier', '/?keyword=Java']);
    await findPosting(0);
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    fireEvent.change(deadlineFromInput(), { target: { value: '2026-12-31' } });
    fireEvent.change(deadlineToInput(), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: '検索' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(RANGE_ERROR);

    await back(user);

    await waitFor(() => expect(location()).toBe('/?keyword=Earlier'));
    await findPosting(0);
    expect(screen.queryByText(RANGE_ERROR)).not.toBeInTheDocument();
  });
});

describe('詳細画面から一覧へ戻ったとき', () => {
  test('一覧の条件で取得し、同じ条件を表示する', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(posting(0));
    vi.mocked(fetchJobPostingAnalysis).mockResolvedValue({
      fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
      skills: [],
    });
    vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
    vi.mocked(getJobPostingMemos).mockResolvedValue([]);
    const user = renderHome([ALL_CONDITIONS]);
    await user.click(await screen.findByRole('link', { name: '1ページ目の求人' }));
    await screen.findByRole('link', { name: '← 求人一覧に戻る' });
    vi.mocked(fetchJobPostings).mockClear();

    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    await findPosting(0);
    expect(location()).toBe(ALL_CONDITIONS);
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(fetchJobPostings).toHaveBeenCalledWith(
      'Java', 'APPLIED', 0, 'companyName,asc', 300000, 500000, '2026-12-01', '2026-12-31',
    );
    expect(shownConditions()).toEqual(ALL_SHOWN);
  });
});
