import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusHistory,
  fetchJobPosting,
  fetchJobPostingAnalysis,
} from '../api/jobPostingApi';
import {
  createJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';
import type { JobPosting, JobPostingAnalysis } from '../types/jobPosting';
import type { JobPostingMemo } from '../types/jobPostingMemo';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const jobPosting: JobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 3,
};

const analysis: JobPostingAnalysis = {
  fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
  skills: [],
};

const memo = (id: number, content: string, version: number): JobPostingMemo => ({
  id,
  content,
  createdAt: '2026-11-08T00:00:00Z',
  updatedAt: '2026-11-08T00:00:00Z',
  version,
});

const MEMO_CONFLICT = new ApiError('競合が発生しました。', 412, 'JOB_POSTING_MEMO_VERSION_CONFLICT');
const MEMO_GONE = new ApiError('メモが見つかりません。', 404, 'JOB_POSTING_MEMO_NOT_FOUND');
const CONFLICT_MESSAGE =
  'このメモは別の画面で更新されました。入力内容を控えてから、最新の内容を読み込んでください。';
const RELOAD = '入力を破棄して最新の内容を読み込む';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/job-postings/5']}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: jobPosting.title });
  return userEvent.setup();
}

const memoRegion = () => screen.getByRole('region', { name: 'メモ' });
const editor = () => within(memoRegion()).getByRole('textbox', { name: 'メモを編集' });
const latestRegion = () => within(memoRegion()).queryByRole('region', { name: '最新の内容' });

// 「書類通過」のメモを編集し、「この画面の内容」と入力して保存すると、別の画面で先に保存されていた状態にする。
async function saveIntoConflict() {
  vi.mocked(getJobPostingMemos)
    .mockResolvedValueOnce([memo(1, '書類通過', 0)])
    .mockResolvedValueOnce([memo(1, '面接は11/30', 1)]);
  vi.mocked(updateJobPostingMemo).mockRejectedValueOnce(MEMO_CONFLICT);
  const user = await renderDetail();
  await within(memoRegion()).findByText('書類通過');

  await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
  await user.clear(editor());
  await user.type(editor(), 'この画面の内容');
  await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));
  await within(memoRegion()).findByText(CONFLICT_MESSAGE);
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue(analysis);
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('メモの同時編集', () => {
  test('編集を始めたときのバージョンで保存する', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '書類通過', 4)]);
    vi.mocked(updateJobPostingMemo).mockResolvedValue(memo(1, '書類通過の追記', 5));
    const user = await renderDetail();
    await within(memoRegion()).findByText('書類通過');

    await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
    await user.type(editor(), 'の追記');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(updateJobPostingMemo).toHaveBeenCalledWith(5, 1, 4, { content: '書類通過の追記' });
  });

  test('編集中に一覧を取り直して新しいバージョンを受け取っても、編集を始めたときのバージョンで保存する', async () => {
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([memo(1, '書類通過', 0)])
      // 別のメモを登録した後の取り直し。編集中のメモは別の画面で更新されている。
      .mockResolvedValue([memo(2, '新しいメモ', 0), memo(1, '面接は11/30', 1)]);
    vi.mocked(createJobPostingMemo).mockResolvedValue(memo(2, '新しいメモ', 0));
    vi.mocked(updateJobPostingMemo).mockRejectedValue(MEMO_CONFLICT);
    const user = await renderDetail();
    await within(memoRegion()).findByText('書類通過');

    await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
    await user.type(within(memoRegion()).getByRole('textbox', { name: 'メモ内容' }), '新しいメモ');
    await user.click(within(memoRegion()).getByRole('button', { name: '登録' }));
    await within(memoRegion()).findByText('新しいメモ');
    await user.type(editor(), 'の追記');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    // 取り直したバージョン(1)で送ると、別の画面の変更を黙って上書きしてしまう。
    expect(updateJobPostingMemo).toHaveBeenCalledWith(5, 1, 0, { content: '書類通過の追記' });
  });

  test('別の画面で先に保存されていたら、入力を残して案内し、最新の内容を見せる', async () => {
    await saveIntoConflict();

    expect(within(memoRegion()).getByRole('alert')).toHaveTextContent(CONFLICT_MESSAGE);
    expect(editor()).toHaveValue('この画面の内容');
    expect(editor()).toBeEnabled();
    // 自分の入力と見比べられるよう、取り直した最新の内容を別に表示する。
    await waitFor(() => expect(latestRegion()).not.toBeNull());
    expect(latestRegion()).toHaveTextContent('面接は11/30');
    expect(within(memoRegion()).getByRole('button', { name: RELOAD })).toBeEnabled();
    // 自動では送り直さない。
    expect(updateJobPostingMemo).toHaveBeenCalledTimes(1);
  });

  test('最新の内容を読み込むと、入力を最新の内容に入れ替え、最新のバージョンで保存できる', async () => {
    const user = await saveIntoConflict();
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面接は11/30', 1)]);
    vi.mocked(updateJobPostingMemo).mockResolvedValueOnce(memo(1, '面接は11/30（オンライン）', 2));

    await user.click(within(memoRegion()).getByRole('button', { name: RELOAD }));

    await waitFor(() => expect(editor()).toHaveValue('面接は11/30'));
    expect(within(memoRegion()).queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument();
    expect(latestRegion()).toBeNull();
    expect(within(memoRegion()).queryByRole('button', { name: RELOAD })).not.toBeInTheDocument();

    await user.type(editor(), '（オンライン）');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(updateJobPostingMemo).toHaveBeenLastCalledWith(5, 1, 1, { content: '面接は11/30（オンライン）' });
  });

  test('最新の内容を読み込んでいる間は、保存と読み込みを押せない', async () => {
    const user = await saveIntoConflict();
    const loading = deferred<JobPostingMemo[]>();
    vi.mocked(getJobPostingMemos).mockReturnValueOnce(loading.promise);

    await user.click(within(memoRegion()).getByRole('button', { name: RELOAD }));
    const callsAfterFirstClick = vi.mocked(getJobPostingMemos).mock.calls.length;

    expect(within(memoRegion()).getByRole('button', { name: '保存' })).toBeDisabled();
    expect(editor()).toBeDisabled();
    // 押した後もフォーカスを失わないよう、disabledではなくaria-disabledにしている。
    const reload = within(memoRegion()).getByRole('button', { name: RELOAD });
    expect(reload).toHaveAttribute('aria-disabled', 'true');
    await user.click(reload);
    expect(getJobPostingMemos).toHaveBeenCalledTimes(callsAfterFirstClick);

    await act(async () => loading.resolve([memo(1, '面接は11/30', 1)]));
    expect(editor()).toHaveValue('面接は11/30');
    // 入れ替えた入力欄へフォーカスを移し、続けて書き足せるようカーソルを末尾に置く。
    expect(editor()).toHaveFocus();
    const textarea = editor() as HTMLTextAreaElement;
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual(['面接は11/30'.length, '面接は11/30'.length]);
    await user.type(editor(), '（オンライン）', { skipClick: true });
    expect(editor()).toHaveValue('面接は11/30（オンライン）');
  });

  test('最新の内容を読み込めなければ、入力を残して案内し、もう一度読み込める', async () => {
    const user = await saveIntoConflict();
    vi.mocked(getJobPostingMemos).mockRejectedValueOnce(new ApiError('メモの取得に失敗しました。', 500));

    await user.click(within(memoRegion()).getByRole('button', { name: RELOAD }));

    expect(await within(memoRegion()).findByText('メモの取得に失敗しました。')).toBeInTheDocument();
    expect(editor()).toHaveValue('この画面の内容');
    // 読み込み中のままにせず、入力・保存・読み込みをもう一度できるようにする。
    expect(editor()).toBeEnabled();
    expect(within(memoRegion()).getByRole('button', { name: '保存' })).toBeEnabled();
    expect(within(memoRegion()).getByRole('button', { name: RELOAD })).toHaveAttribute('aria-disabled', 'false');
  });

  test('読み込んだ内容が一覧より新しくても、読み込んだ内容で編集をやり直す', async () => {
    const user = await saveIntoConflict();
    // 競合の後に一覧を取り直してから、さらに別の画面で保存された。
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, '面接は12/1に変更', 2)]);
    vi.mocked(updateJobPostingMemo).mockResolvedValueOnce(memo(1, '面接は12/1に変更', 3));

    await user.click(within(memoRegion()).getByRole('button', { name: RELOAD }));

    await waitFor(() => expect(editor()).toHaveValue('面接は12/1に変更'));
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));
    expect(updateJobPostingMemo).toHaveBeenLastCalledWith(5, 1, 2, { content: '面接は12/1に変更' });
  });

  test('最新の内容を読み込んだときにメモが削除されていたら、フォームを閉じて案内する', async () => {
    const user = await saveIntoConflict();
    vi.mocked(getJobPostingMemos).mockResolvedValue([]);

    await user.click(within(memoRegion()).getByRole('button', { name: RELOAD }));

    expect(await within(memoRegion()).findByText('このメモは別の画面で削除されました。')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
  });

  test('競合の後に一覧を取り直せなかったら、古い内容を最新の内容として見せない', async () => {
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([memo(1, '書類通過', 0)])
      .mockRejectedValueOnce(new ApiError('メモの取得に失敗しました。', 500));
    vi.mocked(updateJobPostingMemo).mockRejectedValueOnce(MEMO_CONFLICT);
    const user = await renderDetail();
    await within(memoRegion()).findByText('書類通過');

    await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
    await user.type(editor(), 'の追記');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(await within(memoRegion()).findByText(CONFLICT_MESSAGE)).toBeInTheDocument();
    await within(memoRegion()).findByRole('button', { name: 'メモを再読み込み' });
    expect(latestRegion()).toBeNull();
    expect(editor()).toHaveValue('書類通過の追記');
  });

  test('競合の後にキャンセルすると、フォームを閉じて最新の内容を表示する', async () => {
    const user = await saveIntoConflict();
    await waitFor(() => expect(latestRegion()).not.toBeNull());

    await user.click(within(memoRegion()).getByRole('button', { name: 'キャンセル' }));

    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
    expect(within(memoRegion()).getByText('面接は11/30')).toBeInTheDocument();
    expect(within(memoRegion()).queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument();
  });

  test('ほかのメモの編集を始めると、前の競合の案内を消す', async () => {
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([memo(1, '書類通過', 0), memo(2, 'メモB', 0)])
      .mockResolvedValue([memo(1, '面接は11/30', 1), memo(2, 'メモB', 0)]);
    vi.mocked(updateJobPostingMemo).mockRejectedValueOnce(MEMO_CONFLICT);
    const user = await renderDetail();
    await within(memoRegion()).findByText('書類通過');
    await user.click(within(memoRegion()).getAllByRole('button', { name: '編集' })[0]);
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));
    await within(memoRegion()).findByText(CONFLICT_MESSAGE);
    await user.click(within(memoRegion()).getByRole('button', { name: 'キャンセル' }));

    await user.click(within(memoRegion()).getAllByRole('button', { name: '編集' })[1]);

    expect(editor()).toHaveValue('メモB');
    expect(within(memoRegion()).queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('button', { name: RELOAD })).not.toBeInTheDocument();
  });

  test('競合ではなくメモが削除されていたら、これまでどおりフォームを閉じて案内する', async () => {
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([memo(1, '書類通過', 0)])
      .mockResolvedValue([]);
    vi.mocked(updateJobPostingMemo).mockRejectedValueOnce(MEMO_GONE);
    const user = await renderDetail();
    await within(memoRegion()).findByText('書類通過');

    await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(await within(memoRegion()).findByText('このメモは別の画面で削除されました。')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('button', { name: RELOAD })).not.toBeInTheDocument();
  });
});
