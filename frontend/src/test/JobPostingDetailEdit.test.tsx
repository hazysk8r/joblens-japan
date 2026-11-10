import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  deleteJobPosting,
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
  updateJobPosting,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting, JobPostingAnalysis, UpdateJobPostingRequest } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

// AuthenticatedAppのログイン中のユーザーは1。
const EDIT_DRAFT_KEY = 'joblens.posting-edit-draft.1.5';
const MEMO_DRAFT_KEY = 'joblens.memo-draft.1.5';
const DRAFT_NOTICE = '保存していない編集内容があります。';
const CONFLICT_MESSAGE = '別の画面で求人が編集されたため、保存できませんでした。';
const RELOAD_LATEST = '入力を破棄して最新の内容を読み込む';

const jobPosting: JobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: 'https://example.com/jobs/5',
  originalText: '求人の原文',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: 300000,
  salaryMax: 500000,
  applicationDeadline: '2026-12-01',
  version: 3,
};

const values = {
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: 'https://example.com/jobs/5',
  originalText: '求人の原文',
  salaryMin: 300000,
  salaryMax: 500000,
  applicationDeadline: '2026-12-01',
};

const analysis: JobPostingAnalysis = {
  fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
  skills: [],
};

const CONFLICT = new ApiError('競合が発生しました。', 412, 'JOB_POSTING_VERSION_CONFLICT');

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

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
}

// 一覧の検索条件を持って詳細画面を開いた状態にする。その前の履歴は別の画面。
async function renderDetail() {
  render(
    <MemoryRouter
      initialEntries={[
        '/account',
        '/?keyword=Java',
        { pathname: '/job-postings/5', state: { listSearch: '?keyword=Java' } },
      ]}
      initialIndex={2}
    >
      <AuthenticatedApp />
      <LocationDisplay />
      <BackButton />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: jobPosting.title });
  return userEvent.setup();
}

const editButton = () => screen.getByRole('button', { name: '編集' });
const deleteButton = () => screen.getByRole('button', { name: /^削除/ });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /^保存/ });
const storedEditDraft = () => JSON.parse(sessionStorage.getItem(EDIT_DRAFT_KEY) ?? 'null');

async function replaceTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.clear(field('求人タイトル'));
  await user.type(field('求人タイトル'), title);
}

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue(analysis);
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true,
  });
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('求人の編集', () => {
  test('編集を始めると今の内容のフォームを表示し、最初の入力欄にフォーカスする', async () => {
    const user = await renderDetail();

    await user.click(editButton());

    expect(field('会社名')).toHaveValue(values.companyName);
    expect(field('求人タイトル')).toHaveValue(values.title);
    expect(field('求人原文')).toHaveValue(values.originalText);
    expect(field('最低月給')).toHaveValue('300000');
    expect(field('応募締切日')).toHaveValue(values.applicationDeadline);
    expect(field('会社名')).toHaveFocus();
  });

  // 同じ画面で応募ステータスを変えるとversionが上がり、自分の編集の保存が競合してしまう。
  test('編集中は応募ステータスの変更とページ内の移動を出さず、メモと変更履歴は残す', async () => {
    const user = await renderDetail();

    await user.click(editButton());

    expect(screen.queryByRole('combobox', { name: '応募ステータス' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'ページ内の移動' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^削除/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'メモ' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '変更履歴' })).toBeInTheDocument();
  });

  test('保存に成功したら表示を更新して知らせ、編集ボタンにフォーカスを戻す', async () => {
    vi.mocked(updateJobPosting).mockImplementation(async (_id, request: UpdateJobPostingRequest) => ({
      ...jobPosting, ...request, version: 4,
    }));
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '新しいタイトル');

    await user.click(saveButton());

    expect(updateJobPosting).toHaveBeenCalledWith(5, { ...values, title: '新しいタイトル' }, 3);
    expect(await screen.findByRole('heading', { level: 2, name: '新しいタイトル' })).toBeInTheDocument();
    expect(screen.queryByLabelText('求人タイトル')).not.toBeInTheDocument();
    expect(screen.getByText('求人を更新しました。')).toHaveAttribute('role', 'status');
    expect(editButton()).toHaveFocus();
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
    // 原文が変わらなければ、分析は取り直さない。
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(1);
  });

  test('原文を変えて保存したら、分析を取り直す', async () => {
    vi.mocked(updateJobPosting).mockImplementation(async (_id, request: UpdateJobPostingRequest) => ({
      ...jobPosting, ...request, version: 4,
    }));
    const user = await renderDetail();
    await user.click(editButton());
    await user.type(field('求人原文'), '（追記）');

    await user.click(saveButton());

    await waitFor(() => expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('region', { name: '求人票の原文' })).toHaveTextContent('求人の原文（追記）');
  });

  test('成功の案内はしばらくして消す', async () => {
    vi.mocked(updateJobPosting).mockResolvedValue({ ...jobPosting, version: 4 });
    const user = await renderDetail();
    await user.click(editButton());
    await user.click(saveButton());
    await screen.findByText('求人を更新しました。');

    await waitFor(() => expect(screen.queryByText('求人を更新しました。')).not.toBeInTheDocument(), { timeout: 4000 });
  });

  test('項目の検証エラーはフォームに表示し、入力を残す', async () => {
    vi.mocked(updateJobPosting).mockRejectedValue(new ApiError(
      '入力値が正しくありません。', 400, 'VALIDATION_FAILED', { title: 'タイトルを確認してください。' },
    ));
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '直したタイトル');

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('入力値が正しくありません。');
    expect(field('求人タイトル')).toHaveAccessibleDescription('タイトルを確認してください。');
    expect(field('求人タイトル')).toHaveValue('直したタイトル');
  });

  test.each([
    ['見つからない', new ApiError('求人が見つかりません。', 404, 'JOB_POSTING_NOT_FOUND'), '求人が見つかりません。'],
    ['通信エラー', new TypeError('Failed to fetch'), '求人の保存に失敗しました。'],
  ])('%sときはメッセージを表示し、入力を残す', async (_, error, message) => {
    vi.mocked(updateJobPosting).mockRejectedValue(error);
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '残すタイトル');

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`^${message}$`));
    expect(field('求人タイトル')).toHaveValue('残すタイトル');
    expect(screen.queryByRole('button', { name: RELOAD_LATEST })).not.toBeInTheDocument();
  });

  test('versionが競合したら入力を残して案内し、最新を読み込むと最新の内容で編集をやり直す', async () => {
    vi.mocked(updateJobPosting).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '自分の変更');

    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_MESSAGE);
    expect(field('求人タイトル')).toHaveValue('自分の変更');

    vi.mocked(fetchJobPosting).mockResolvedValue({ ...jobPosting, title: '別の画面の変更', version: 7 });
    await user.click(screen.getByRole('button', { name: RELOAD_LATEST }));

    await waitFor(() => expect(field('求人タイトル')).toHaveValue('別の画面の変更'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field('会社名')).toHaveFocus();
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();

    vi.mocked(updateJobPosting).mockResolvedValueOnce({ ...jobPosting, title: '別の画面の変更', version: 8 });
    await user.click(saveButton());
    expect(updateJobPosting).toHaveBeenLastCalledWith(5, expect.objectContaining({ title: '別の画面の変更' }), 7);
  });

  test('最新を読み込むと、編集の外の表示も最新にする', async () => {
    vi.mocked(updateJobPosting).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await user.click(editButton());
    await user.click(saveButton());
    vi.mocked(fetchJobPosting).mockResolvedValue({ ...jobPosting, title: '別の画面の変更', version: 7 });

    await user.click(await screen.findByRole('button', { name: RELOAD_LATEST }));

    expect(await screen.findByRole('heading', { level: 2, name: '別の画面の変更' })).toBeInTheDocument();
  });

  test('最新の読み込み中に画面を離れると、読み込みを中断する', async () => {
    vi.mocked(updateJobPosting).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await user.click(editButton());
    await user.click(saveButton());
    await screen.findByRole('button', { name: RELOAD_LATEST });
    vi.mocked(fetchJobPosting).mockClear();
    vi.mocked(fetchJobPosting).mockReturnValue(new Promise(() => {}));

    await user.click(screen.getByRole('button', { name: RELOAD_LATEST }));
    const signal = vi.mocked(fetchJobPosting).mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    expect(signal.aborted).toBe(true);
  });

  // 一度フォーカスを戻した後も指示が残ると、画面が描き直されるたびにフォーカスを奪ってしまう。
  test('編集ボタンにフォーカスを戻した後は、他の操作中にフォーカスを奪わない', async () => {
    vi.mocked(updateJobPosting).mockResolvedValue({ ...jobPosting, version: 4 });
    const user = await renderDetail();
    await user.click(editButton());
    await user.click(saveButton());
    await screen.findByText('求人を更新しました。');
    const memoField = within(screen.getByRole('region', { name: 'メモ' })).getByLabelText('メモ内容');

    await user.click(memoField);
    // 成功の案内が消えるときに、詳細画面が描き直される。
    await waitFor(() => expect(screen.queryByText('求人を更新しました。')).not.toBeInTheDocument(), { timeout: 4000 });

    expect(memoField).toHaveFocus();
  });

  test('最新の読み込みに失敗したら、入力を残して知らせる', async () => {
    vi.mocked(updateJobPosting).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '自分の変更');
    await user.click(saveButton());
    await screen.findByRole('button', { name: RELOAD_LATEST });
    vi.mocked(fetchJobPosting).mockRejectedValue(new TypeError('Failed to fetch'));

    await user.click(screen.getByRole('button', { name: RELOAD_LATEST }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('最新の求人を読み込めませんでした。'));
    expect(field('求人タイトル')).toHaveValue('自分の変更');
  });

  // disabledにすると、保存を押した直後にフォーカスがページの先頭へ外れる。
  test('保存中は入力を変更できず、ボタンを無効にせずに二重の保存を防ぐ', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(updateJobPosting).mockReturnValue(pending.promise);
    const user = await renderDetail();
    await user.click(editButton());

    await user.click(saveButton());
    await user.type(field('求人タイトル'), '追記');
    await user.click(saveButton());

    expect(updateJobPosting).toHaveBeenCalledTimes(1);
    expect(field('求人タイトル')).toHaveAttribute('readonly');
    expect(field('求人タイトル')).toHaveValue(values.title);
    expect(saveButton()).not.toHaveAttribute('disabled');
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton()).toHaveFocus();
    await act(async () => pending.resolve({ ...jobPosting, version: 4 }));
  });

  test('変更していなければ確認せずに取り消し、編集ボタンにフォーカスを戻す', async () => {
    const user = await renderDetail();
    await user.click(editButton());

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('求人タイトル')).not.toBeInTheDocument();
    expect(editButton()).toHaveFocus();
    expect(updateJobPosting).not.toHaveBeenCalled();
  });

  test('変更していれば確認し、やめたら編集を続ける', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '書きかけ');

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(window.confirm).toHaveBeenCalledWith('編集内容を破棄しますか？');
    expect(field('求人タイトル')).toHaveValue('書きかけ');
    expect(storedEditDraft()).not.toBeNull();
  });

  test('変更していて確認したら、取り消して一時保存も消す', async () => {
    const user = await renderDetail();
    await user.click(editButton());
    await replaceTitle(user, '書きかけ');

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(window.confirm).toHaveBeenCalledWith('編集内容を破棄しますか？');
    expect(screen.queryByLabelText('求人タイトル')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
  });
});

describe('編集の一時保存', () => {
  test('変更すると、編集を始めたときのversionと一緒に保存し、元に戻すと消す', async () => {
    const user = await renderDetail();
    await user.click(editButton());

    await replaceTitle(user, '書きかけ');
    expect(storedEditDraft()).toEqual({ baseVersion: 3, values: { ...values, title: '書きかけ' } });

    await replaceTitle(user, values.title);
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
  });

  test('開いたときに保存していない編集があれば知らせ、再開すると復元して最初の入力欄にフォーカスする', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 2, values: { ...values, title: '前回の書きかけ' } }));
    const user = await renderDetail();

    expect(screen.getByText(DRAFT_NOTICE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '編集を再開' }));

    expect(field('求人タイトル')).toHaveValue('前回の書きかけ');
    expect(field('会社名')).toHaveFocus();
    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
  });

  // 編集を始めた後に別の画面で変わっていたら、上書きせずに競合として扱う。
  test('再開した編集は、編集を始めたときのversionで保存する', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 2, values: { ...values, title: '前回の書きかけ' } }));
    vi.mocked(updateJobPosting).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集を再開' }));

    await user.click(saveButton());

    expect(updateJobPosting).toHaveBeenCalledWith(5, expect.objectContaining({ title: '前回の書きかけ' }), 2);
    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_MESSAGE);
  });

  // 書き足した編集を残すときも、編集を始めたときのversionのままにする。今のversionにすると、
  // 一時保存の後に別の画面で変わった内容を、再開して保存したときに上書きしてしまう。
  test('再開した編集を書き足しても、一時保存のversionは編集を始めたときのまま', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 2, values: { ...values, title: '前回の書きかけ' } }));
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集を再開' }));

    await user.type(field('求人タイトル'), 'に追記');

    expect(storedEditDraft()).toEqual({ baseVersion: 2, values: { ...values, title: '前回の書きかけに追記' } });
  });

  test('編集を始め直して取り消した後は、前の編集の案内を出さない', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 3, values: { ...values, title: '前回の書きかけ' } }));
    const user = await renderDetail();
    await user.click(editButton());

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
  });

  test('破棄すると案内と一時保存を消す', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 3, values: { ...values, title: '前回の書きかけ' } }));
    const user = await renderDetail();

    await user.click(screen.getByRole('button', { name: '破棄' }));

    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
    expect(editButton()).toHaveFocus();
  });

  test('編集を始め直すと、保存していない編集の案内を消す', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 3, values: { ...values, title: '前回の書きかけ' } }));
    const user = await renderDetail();

    await user.click(editButton());

    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
    expect(field('求人タイトル')).toHaveValue(values.title);
  });

  test.each([
    ['JSONでない', '{broken'],
    ['versionがない', JSON.stringify({ values })],
    ['versionが負の数', JSON.stringify({ baseVersion: -1, values })],
    ['versionが小数', JSON.stringify({ baseVersion: 1.5, values })],
    ['versionが文字列', JSON.stringify({ baseVersion: '3', values })],
    ['値がない', JSON.stringify({ baseVersion: 3 })],
    ['値の形が正しくない', JSON.stringify({ baseVersion: 3, values: { ...values, title: 5 } })],
  ])('保存された値が%sなら無視する', async (_, value) => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, value);

    await renderDetail();

    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
  });

  test.each([
    ['別の求人', 'joblens.posting-edit-draft.1.6'],
    ['別のユーザー', 'joblens.posting-edit-draft.2.5'],
  ])('%sの一時保存は読まない', async (_, key) => {
    sessionStorage.setItem(key, JSON.stringify({ baseVersion: 3, values }));

    await renderDetail();

    expect(screen.queryByText(DRAFT_NOTICE)).not.toBeInTheDocument();
  });
});

describe('求人の削除', () => {
  test('確認すると削除し、検索条件の付いた一覧へ移動して、戻る操作で詳細へ戻らない', async () => {
    vi.mocked(deleteJobPosting).mockResolvedValue();
    const user = await renderDetail();

    await user.click(deleteButton());

    expect(window.confirm).toHaveBeenCalledWith('「バックエンドエンジニア」を削除しますか？');
    expect(deleteJobPosting).toHaveBeenCalledWith(5);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java'));

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    expect(screen.getByTestId('location').textContent).not.toBe('/job-postings/5');
  });

  test('すでに削除されていたら、削除できたものとして一覧へ移動する', async () => {
    vi.mocked(deleteJobPosting).mockRejectedValue(new ApiError('求人が見つかりません。', 404, 'JOB_POSTING_NOT_FOUND'));
    const user = await renderDetail();

    await user.click(deleteButton());

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java'));
  });

  test('削除したら、その求人のメモと編集の一時保存を消す', async () => {
    sessionStorage.setItem(MEMO_DRAFT_KEY, 'メモの書きかけ');
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({ baseVersion: 3, values }));
    sessionStorage.setItem('joblens.memo-draft.1.6', '別の求人のメモ');
    vi.mocked(deleteJobPosting).mockResolvedValue();
    const user = await renderDetail();

    await user.click(deleteButton());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java'));

    expect(sessionStorage.getItem(MEMO_DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem('joblens.memo-draft.1.6')).toBe('別の求人のメモ');
  });

  test('確認でやめたら削除しない', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = await renderDetail();

    await user.click(deleteButton());

    expect(deleteJobPosting).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/job-postings/5');
  });

  test.each([
    ['サーバーのエラー', new ApiError('削除できません。', 500), '削除できません。'],
    ['通信エラー', new TypeError('Failed to fetch'), '削除中に不明なエラーが発生しました。'],
  ])('%sなら詳細に留まってメッセージを表示し、もう一度削除できる', async (_, error, message) => {
    vi.mocked(deleteJobPosting).mockRejectedValueOnce(error).mockResolvedValueOnce();
    const user = await renderDetail();

    await user.click(deleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`^${message}$`));
    expect(screen.getByTestId('location')).toHaveTextContent('/job-postings/5');

    await user.click(deleteButton());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?keyword=Java'));
  });

  test('削除中は削除中と表示し、もう一度押しても要求は1回だけ', async () => {
    const pending = deferred<void>();
    vi.mocked(deleteJobPosting).mockReturnValue(pending.promise);
    const user = await renderDetail();

    await user.click(deleteButton());
    await user.click(deleteButton());

    expect(deleteJobPosting).toHaveBeenCalledTimes(1);
    expect(deleteButton()).toHaveTextContent('削除中…');
    expect(deleteButton()).toHaveAttribute('aria-disabled', 'true');
    expect(deleteButton()).not.toHaveAttribute('disabled');
    expect(editButton()).toHaveAttribute('aria-disabled', 'true');

    await user.click(editButton());
    expect(screen.queryByLabelText('求人タイトル')).not.toBeInTheDocument();
    await act(async () => pending.resolve());
  });

  test('検索条件なしで開いた詳細からは、条件なしの一覧へ移動する', async () => {
    vi.mocked(deleteJobPosting).mockResolvedValue();
    render(
      <MemoryRouter initialEntries={['/job-postings/5']}>
        <AuthenticatedApp />
        <LocationDisplay />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 2, name: jobPosting.title });

    await user.click(deleteButton());

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  });

  test('一覧に戻ったときは削除した求人を表示しない', async () => {
    vi.mocked(deleteJobPosting).mockResolvedValue();
    const user = await renderDetail();

    await user.click(deleteButton());

    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledWith(
      'Java', '', 0, expect.anything(), null, null, null, null,
    ));
    expect(within(document.body).queryByRole('heading', { level: 2, name: jobPosting.title })).not.toBeInTheDocument();
  });
});
