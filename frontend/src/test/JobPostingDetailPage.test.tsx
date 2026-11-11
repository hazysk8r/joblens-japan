import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting, JobPostingAnalysis } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const jobPosting: JobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: 'https://example.com/jobs/5',
  originalText: '【給与】\n月給30万円\n\n【勤務地】\n東京都',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'APPLIED',
  salaryMin: 300000,
  salaryMax: 450000,
  applicationDeadline: '2026-12-01',
  version: 3,
};

const analysis: JobPostingAnalysis = {
  fixedOvertime: {
    status: 'PRESENT',
    hours: 40,
    excessPayStated: true,
    evidence: [{ section: '給与', text: '固定残業代40時間分を含む', start: 0, end: 0 }],
  },
  skills: ['Java'],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

// ブラウザの「戻る」と同じ履歴の移動(POP)を起こす。
function BrowserBackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>ブラウザで戻る</button>;
}

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthenticatedApp />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

function notFoundError() {
  return new ApiError('求人が見つかりません。', 404, 'JOB_POSTING_NOT_FOUND');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [jobPosting],
    page: 0,
    size: 5,
    totalElements: 1,
    totalPages: 1,
    first: true,
    last: true,
  });
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0, applied: 1, interviewing: 0, offered: 0, rejected: 0,
  });
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue(analysis);
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('表示', () => {
  test('求人の情報と原文全体を表示する', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);

    renderAt('/job-postings/5');

    expect(await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' }))
      .toBeInTheDocument();
    expect(screen.getByText('○○株式会社')).toBeInTheDocument();
    expect(screen.getByText('300,000円 ～ 450,000円')).toBeInTheDocument();
    expect(screen.getByText('2026-12-01')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '応募ステータス' })).toHaveValue('APPLIED');
    expect(screen.getByRole('link', { name: '原文を見る' }))
      .toHaveAttribute('href', 'https://example.com/jobs/5');

    // 改行を含む原文がそのまま1つの要素に入っている。
    const original = screen.getByRole('region', { name: '求人票の原文' });
    expect(within(original).getByText(/【給与】/).textContent)
      .toBe('【給与】\n月給30万円\n\n【勤務地】\n東京都');
    expect(fetchJobPosting).toHaveBeenCalledWith(5, expect.any(AbortSignal));
  });

  test('未登録の項目は未登録と表示する', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue({
      ...jobPosting,
      companyName: null,
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      sourceUrl: null,
    });

    renderAt('/job-postings/5');

    expect(await screen.findByText('会社名未登録')).toBeInTheDocument();
    expect(screen.getByText('給与未登録')).toBeInTheDocument();
    expect(screen.getByText('未登録')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
  });

  test.each([
    [300000, null, '300,000円以上'],
    [null, 450000, '450,000円以下'],
  ])('給与が下限%s・上限%sなら「%s」と表示する', async (salaryMin, salaryMax, text) => {
    vi.mocked(fetchJobPosting).mockResolvedValue({ ...jobPosting, salaryMin, salaryMax });

    renderAt('/job-postings/5');

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  test('httpでもhttpsでもない求人URLはリンクにしない', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue({
      ...jobPosting,
      sourceUrl: 'javascript:alert(1)',
    });

    renderAt('/job-postings/5');

    await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' });
    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
  });

  test('取得中は読み込み中と表示する', async () => {
    vi.mocked(fetchJobPosting).mockReturnValue(new Promise(() => {}));

    renderAt('/job-postings/5');

    expect(await screen.findByText('読み込み中…')).toBeInTheDocument();
  });
});

describe('見つからない求人', () => {
  test.each([
    'abc',
    '0',
    '-1',
    '1.5',
    '1e3',
    // Number()では16や5として読めてしまい、URLと違う求人を開くことになる。
    '0x10',
    '+5',
    '007',
    ' 5',
    // JavaScriptの数値で正確に表せない(丸められると別のIDになる)。
    '9007199254740993',
    '12345678901234567890',
  ])('IDが「%s」なら通信せずに見つからないと表示する', async (id) => {
    renderAt(`/job-postings/${encodeURIComponent(id)}`);

    expect(await screen.findByText('求人が見つかりません')).toBeInTheDocument();
    expect(fetchJobPosting).not.toHaveBeenCalled();
  });

  test('正確に表せる最大のIDまでは通信する', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(notFoundError());

    renderAt('/job-postings/9007199254740991');

    expect(await screen.findByText('求人が見つかりません')).toBeInTheDocument();
    expect(fetchJobPosting).toHaveBeenCalledWith(9007199254740991, expect.any(AbortSignal));
  });

  test('404なら見つからないと表示し、再試行は出さない', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(notFoundError());

    renderAt('/job-postings/5');

    expect(await screen.findByText('求人が見つかりません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  });
});

describe('取得の失敗', () => {
  test('404以外の失敗はメッセージと再試行を表示し、再試行すると表示できる', async () => {
    vi.mocked(fetchJobPosting)
      .mockRejectedValueOnce(new ApiError('サーバーでエラーが発生しました。', 500))
      .mockResolvedValueOnce(jobPosting);
    const user = userEvent.setup();

    renderAt('/job-postings/5');

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーでエラーが発生しました。');
    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchJobPosting).toHaveBeenCalledTimes(2);
  });

  test('再試行中は読み込み中と表示する', async () => {
    const retried = deferred<JobPosting>();
    vi.mocked(fetchJobPosting)
      .mockRejectedValueOnce(new ApiError('サーバーでエラーが発生しました。', 500))
      .mockReturnValueOnce(retried.promise);
    const user = userEvent.setup();

    renderAt('/job-postings/5');
    await user.click(await screen.findByRole('button', { name: '再試行' }));

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('Errorでない失敗は既定のメッセージを表示する', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue('unknown');

    renderAt('/job-postings/5');

    expect(await screen.findByRole('alert')).toHaveTextContent('求人の取得に失敗しました。');
  });
});

describe('求人票の分析', () => {
  test('開くとボタンを押さなくても分析を表示し、原文より上に置く', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);

    renderAt('/job-postings/5');

    const fixedOvertime = await screen.findByRole('region', { name: '固定残業代' });
    expect(within(fixedOvertime).getByText('あり（月40時間分）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '求人票を分析' })).not.toBeInTheDocument();
    expect(fetchJobPostingAnalysis).toHaveBeenCalledWith(5, expect.any(AbortSignal));

    const analysisHeading = screen.getByRole('heading', { level: 3, name: '求人票の分析' });
    const originalHeading = screen.getByRole('heading', { level: 3, name: '求人票の原文' });
    expect(analysisHeading.compareDocumentPosition(originalHeading))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test('分析中でも求人の情報と原文は表示する', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
    vi.mocked(fetchJobPostingAnalysis).mockReturnValue(new Promise(() => {}));

    renderAt('/job-postings/5');

    expect(await screen.findByText('分析中…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'バックエンドエンジニア' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '求人票の原文' })).getByText(/【給与】/))
      .toBeInTheDocument();
  });

  test('分析に失敗しても原文は表示し、再試行では分析だけを取り直す', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
    vi.mocked(fetchJobPostingAnalysis)
      .mockRejectedValueOnce(new ApiError('サーバーでエラーが発生しました。', 500))
      .mockResolvedValueOnce(analysis);
    const user = userEvent.setup();

    renderAt('/job-postings/5');

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーでエラーが発生しました。');
    expect(within(screen.getByRole('region', { name: '求人票の原文' })).getByText(/【給与】/))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '分析を再試行' }));

    expect(await screen.findByRole('region', { name: '固定残業代' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2);
    expect(fetchJobPosting).toHaveBeenCalledTimes(1);
  });

  test('求人を取得できなかったときは分析を要求しない', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(notFoundError());

    renderAt('/job-postings/5');

    await screen.findByText('求人が見つかりません');
    expect(fetchJobPostingAnalysis).not.toHaveBeenCalled();
  });

  test('一覧を開いても分析は要求せず、分析のボタンもない', async () => {
    renderAt('/');

    await screen.findByRole('link', { name: 'バックエンドエンジニア' });
    expect(screen.queryByRole('button', { name: '求人票を分析' })).not.toBeInTheDocument();
    expect(fetchJobPostingAnalysis).not.toHaveBeenCalled();
  });
});

describe('ルーティング', () => {
  test('/job-postings/new は求人の登録画面のまま', async () => {
    renderAt('/job-postings/new');

    expect(await screen.findByRole('button', { name: '登録' })).toBeInTheDocument();
    expect(fetchJobPosting).not.toHaveBeenCalled();
  });
});

describe('一覧に戻る', () => {
  test('一覧から開くと、一覧の検索条件を付けて戻る', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
    const user = userEvent.setup();

    renderAt('/?keyword=Java&status=APPLIED');
    await user.click(await screen.findByRole('link', { name: 'バックエンドエンジニア' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/job-postings/5');
    await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' });

    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java&status=APPLIED');
    await waitFor(() => expect(fetchJobPostings).toHaveBeenLastCalledWith(
      'Java', 'APPLIED', 0, expect.anything(), null, null, null, null,
    ));
    expect(screen.getByRole('textbox', { name: '検索キーワード' })).toHaveValue('Java');
  });

  test('ブラウザの戻るでも一覧の検索条件が復元され、一覧の取得は1回だけ', async () => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/?keyword=Java&status=APPLIED']}>
        <AuthenticatedApp />
        <LocationDisplay />
        <BrowserBackButton />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('link', { name: 'バックエンドエンジニア' }));
    await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' });
    vi.mocked(fetchJobPostings).mockClear();

    await user.click(screen.getByRole('button', { name: 'ブラウザで戻る' }));

    await screen.findByRole('link', { name: 'バックエンドエンジニア' });
    expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java&status=APPLIED');
    expect(screen.getByRole('textbox', { name: '検索キーワード' })).toHaveValue('Java');
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(fetchJobPostings).toHaveBeenCalledWith(
      'Java', 'APPLIED', 0, expect.anything(), null, null, null, null,
    );
  });

  test.each([
    ['stateがない', undefined],
    ['別のオリジン', { listSearch: '//evil.example.com' }],
    ['?で始まらない', { listSearch: 'keyword=Java' }],
    ['文字列でない', { listSearch: { keyword: 'Java' } }],
    ['別の形のstate', { from: '/account' }],
  ])('%sなら検索条件なしの一覧に戻る', async (_, state) => {
    vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);

    renderAt({ pathname: '/job-postings/5', state });

    expect(await screen.findByRole('link', { name: '← 求人一覧に戻る' }))
      .toHaveAttribute('href', '/');
  });

  test('見つからない求人の画面からも一覧に戻れる', async () => {
    renderAt({ pathname: '/job-postings/abc', state: { listSearch: '?keyword=Java' } });

    expect(await screen.findByRole('link', { name: '← 求人一覧に戻る' }))
      .toHaveAttribute('href', '/?keyword=Java');
  });
});
