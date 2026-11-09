import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { useJobPostingDetail } from '../hooks/useJobPostingDetail';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusHistory,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  fetchJobPostings,
  updateApplicationStatus,
} from '../api/jobPostingApi';
import {
  createJobPostingMemo,
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';
import type { JobPosting, JobPostingAnalysis, JobPostingStatusHistory } from '../types/jobPosting';
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

const memo = (id: number, content: string): JobPostingMemo => ({
  id,
  content,
  createdAt: '2026-11-08T00:00:00Z',
  updatedAt: '2026-11-08T00:00:00Z',
});

const historyEntry: JobPostingStatusHistory = {
  id: 1,
  fromStatus: 'SAVED',
  toStatus: 'APPLIED',
  changedAt: '2026-11-08T01:00:00Z',
};

const CONFLICT = new ApiError('競合が発生しました。', 412, 'JOB_POSTING_VERSION_CONFLICT');
const NETWORK_ERROR = new TypeError('Failed to fetch');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

const statusSelect = () => screen.getByRole('combobox', { name: '応募ステータス' });
const changeButton = () => screen.getByRole('button', { name: '変更' });

async function changeStatus(user: ReturnType<typeof userEvent.setup>, status: string) {
  await user.selectOptions(statusSelect(), status);
  await user.click(changeButton());
}

const MEMO_DRAFT_KEY = 'joblens.memo-draft.1.5';
const memoRegion = () => screen.getByRole('region', { name: 'メモ' });
const historyRegion = () => screen.getByRole('region', { name: '変更履歴' });
const memoItem = (content: string) => {
  const item = within(memoRegion()).getByText(content).closest('li');
  if (!item) {
    throw new Error(`メモが見つかりません: ${content}`);
  }
  return item;
};

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  // jsdomにはスクロールの実装がない。
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

describe('画面の構成', () => {
  test('分析、原文、メモ、変更履歴の順に表示する', async () => {
    await renderDetail();

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

    expect(headings).toEqual(['求人票の分析', '求人票の原文', 'メモ', '変更履歴']);
  });

  test('メモと変更履歴は押さなくても取得する', async () => {
    await renderDetail();

    await waitFor(() => expect(getJobPostingMemos).toHaveBeenCalledWith(5, expect.any(AbortSignal)));
    expect(fetchApplicationStatusHistory).toHaveBeenCalledWith(5, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'メモを見る' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '変更履歴を表示' })).not.toBeInTheDocument();
  });

  test('メモの取得に失敗しても、他の領域はそのまま表示する', async () => {
    vi.mocked(getJobPostingMemos).mockRejectedValue(new ApiError('メモのエラー', 500));
    vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([historyEntry]);
    await renderDetail();

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent('メモのエラー');
    expect(await within(historyRegion()).findByText(/保存済み → 応募済み/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '求人票の原文' })).toHaveTextContent('求人の原文');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  test('変更履歴の取得に失敗しても、他の領域はそのまま表示する', async () => {
    vi.mocked(fetchApplicationStatusHistory).mockRejectedValue(new ApiError('履歴のエラー', 500));
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    await renderDetail();

    expect(await within(historyRegion()).findByRole('alert')).toHaveTextContent('履歴のエラー');
    expect(await within(memoRegion()).findByText('面談準備')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  test('求人を取得できなかったときは、メモも変更履歴も要求しない', async () => {
    vi.mocked(fetchJobPosting).mockRejectedValue(new ApiError('求人が見つかりません。', 404));
    render(
      <MemoryRouter initialEntries={['/job-postings/5']}>
        <AuthenticatedApp />
      </MemoryRouter>,
    );

    await screen.findByText('求人が見つかりません');
    expect(getJobPostingMemos).not.toHaveBeenCalled();
    expect(fetchApplicationStatusHistory).not.toHaveBeenCalled();
  });
});

describe('応募ステータスの変更', () => {
  test('今の状態を選択欄に表示し、すべての状態を選べる', async () => {
    await renderDetail();

    expect(statusSelect()).toHaveValue('SAVED');
    expect(within(statusSelect()).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['保存済み', '応募済み', '面接中', '内定', '不採用']);
  });

  test('変更すると応答の内容を表示し、変更履歴だけを取り直す', async () => {
    vi.mocked(updateApplicationStatus).mockResolvedValue({
      ...jobPosting, applicationStatus: 'APPLIED', version: 4,
    });
    const user = await renderDetail();
    await waitFor(() => expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(1));
    vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([historyEntry]);

    await changeStatus(user, 'APPLIED');

    expect(updateApplicationStatus).toHaveBeenCalledWith(5, { status: 'APPLIED' }, 3);
    await waitFor(() => expect(statusSelect()).toHaveValue('APPLIED'));
    expect(await within(historyRegion()).findByText(/保存済み → 応募済み/)).toBeInTheDocument();
    expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(2);
    expect(fetchJobPosting).toHaveBeenCalledTimes(1);
    expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('変更中は選択欄を無効にして、変更中と表示する', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(updateApplicationStatus).mockReturnValue(pending.promise);
    const user = await renderDetail();

    await changeStatus(user, 'APPLIED');

    expect(statusSelect()).toBeDisabled();
    expect(screen.getByText('ステータス変更中…')).toBeInTheDocument();

    await act(async () => pending.resolve({ ...jobPosting, applicationStatus: 'APPLIED', version: 4 }));

    expect(statusSelect()).toBeEnabled();
    expect(screen.queryByText('ステータス変更中…')).not.toBeInTheDocument();
  });

  test('続けて変更すると、前の応答のversionで要求する', async () => {
    vi.mocked(updateApplicationStatus).mockResolvedValueOnce({
      ...jobPosting, applicationStatus: 'APPLIED', version: 4,
    });
    vi.mocked(updateApplicationStatus).mockResolvedValueOnce({
      ...jobPosting, applicationStatus: 'INTERVIEWING', version: 5,
    });
    const user = await renderDetail();

    await changeStatus(user, 'APPLIED');
    await waitFor(() => expect(statusSelect()).toHaveValue('APPLIED'));
    await changeStatus(user, 'INTERVIEWING');

    expect(updateApplicationStatus).toHaveBeenLastCalledWith(5, { status: 'INTERVIEWING' }, 4);
  });

  test('変更してもメモの入力中の内容は消えない', async () => {
    vi.mocked(updateApplicationStatus).mockResolvedValue({
      ...jobPosting, applicationStatus: 'APPLIED', version: 4,
    });
    const user = await renderDetail();
    await user.type(within(memoRegion()).getByLabelText('メモ内容'), '書きかけのメモ');

    await changeStatus(user, 'APPLIED');
    await waitFor(() => expect(statusSelect()).toHaveValue('APPLIED'));

    expect(within(memoRegion()).getByLabelText('メモ内容')).toHaveValue('書きかけのメモ');
  });

  test('versionが競合したら案内して最新の求人と変更履歴を表示し、次はそのversionで要求する', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await waitFor(() => expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(1));
    vi.mocked(fetchJobPosting).mockResolvedValue({
      ...jobPosting, applicationStatus: 'INTERVIEWING', version: 9,
    });

    await changeStatus(user, 'APPLIED');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /^別の画面で求人が編集されたため、変更は反映されませんでした。最新の内容を表示しています。$/,
    );
    await waitFor(() => expect(statusSelect()).toHaveValue('INTERVIEWING'));
    await waitFor(() => expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(2));
    expect(fetchJobPosting).toHaveBeenLastCalledWith(5, expect.any(AbortSignal));
    expect(updateApplicationStatus).toHaveBeenCalledTimes(1);

    vi.mocked(updateApplicationStatus).mockResolvedValueOnce({
      ...jobPosting, applicationStatus: 'OFFERED', version: 10,
    });
    await changeStatus(user, 'OFFERED');
    expect(updateApplicationStatus).toHaveBeenLastCalledWith(5, { status: 'OFFERED' }, 9);
  });

  test('競合の復旧で原文が変わっていたら、分析を取り直す', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    await waitFor(() => expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(1));
    vi.mocked(fetchJobPosting).mockResolvedValue({
      ...jobPosting, originalText: '別の画面で直した原文', version: 9,
    });

    await changeStatus(user, 'APPLIED');

    await waitFor(() => expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('region', { name: '求人票の原文' })).toHaveTextContent('別の画面で直した原文');
  });

  test('競合の復旧にも失敗したら、再読み込みを案内して選択を残す', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    vi.mocked(fetchJobPosting).mockRejectedValue(NETWORK_ERROR);

    await changeStatus(user, 'APPLIED');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      '別の画面で求人が編集されたため、変更は反映されませんでした。最新の求人を読み込めませんでした。ページを再読み込みしてください。',
    ));
    expect(statusSelect()).toHaveValue('APPLIED');
    expect(statusSelect()).toBeEnabled();
  });

  test('競合の復旧中に一覧へ戻ると、取得を中断する', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(CONFLICT);
    const user = await renderDetail();
    vi.mocked(fetchJobPosting).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchJobPosting).mockClear();

    await changeStatus(user, 'APPLIED');
    await waitFor(() => expect(fetchJobPosting).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetchJobPosting).mock.calls[0][1];
    expect(signal.aborted).toBe(false);

    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    expect(signal.aborted).toBe(true);
  });

  test('その他の失敗はサーバーのメッセージを表示し、選択を残して変更履歴は取り直さない', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(new ApiError('変更できません。', 429));
    const user = await renderDetail();
    await waitFor(() => expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(1));

    await changeStatus(user, 'APPLIED');

    expect(await screen.findByRole('alert')).toHaveTextContent('変更できません。');
    expect(statusSelect()).toHaveValue('APPLIED');
    expect(statusSelect()).toBeEnabled();
    expect(fetchApplicationStatusHistory).toHaveBeenCalledTimes(1);
    expect(fetchJobPosting).toHaveBeenCalledTimes(1);
  });

  test('通信エラーの英語の文言は表示しない', async () => {
    vi.mocked(updateApplicationStatus).mockRejectedValueOnce(NETWORK_ERROR);
    const user = await renderDetail();

    await changeStatus(user, 'APPLIED');

    expect(await screen.findByRole('alert')).toHaveTextContent(/^応募ステータスの変更に失敗しました。$/);
  });

  test('次の変更を始めると前のエラーを消す', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(updateApplicationStatus)
      .mockRejectedValueOnce(new ApiError('変更できません。', 429))
      .mockReturnValueOnce(pending.promise);
    const user = await renderDetail();
    await changeStatus(user, 'APPLIED');
    await screen.findByRole('alert');

    await changeStatus(user, 'OFFERED');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('応募ステータスの選択と変更ボタン', () => {
  test('選択しただけでは変更しない', async () => {
    const user = await renderDetail();

    await user.selectOptions(statusSelect(), 'APPLIED');

    expect(updateApplicationStatus).not.toHaveBeenCalled();
    expect(statusSelect()).toHaveValue('APPLIED');
    expect(changeButton()).toHaveAttribute('aria-disabled', 'false');
  });

  test('今の状態のままならボタンを押しても変更しない', async () => {
    const user = await renderDetail();

    expect(changeButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(changeButton());

    expect(updateApplicationStatus).not.toHaveBeenCalled();
  });

  test('今の状態に選び直すと、ボタンを押しても変更しない', async () => {
    const user = await renderDetail();
    await user.selectOptions(statusSelect(), 'APPLIED');
    await user.selectOptions(statusSelect(), 'SAVED');

    await user.click(changeButton());

    expect(updateApplicationStatus).not.toHaveBeenCalled();
  });

  test('変更中にもう一度押しても、要求は1回だけ', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(updateApplicationStatus).mockReturnValue(pending.promise);
    const user = await renderDetail();

    await changeStatus(user, 'APPLIED');
    expect(changeButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(changeButton());

    expect(updateApplicationStatus).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ...jobPosting, applicationStatus: 'APPLIED', version: 4 }));
  });

  // disabledにすると、押した直後にキーボードのフォーカスがページの先頭へ外れる。
  // jsdomはこの動きを再現しないため、属性を確かめ、実際の移動はブラウザで確かめる。
  test('変更中も変更後も、ボタンにフォーカスを残す', async () => {
    const pending = deferred<JobPosting>();
    vi.mocked(updateApplicationStatus).mockReturnValue(pending.promise);
    const user = await renderDetail();

    await changeStatus(user, 'APPLIED');

    expect(changeButton()).not.toHaveAttribute('disabled');
    expect(changeButton()).toHaveFocus();
    await act(async () => pending.resolve({ ...jobPosting, applicationStatus: 'APPLIED', version: 4 }));
    expect(changeButton()).not.toHaveAttribute('disabled');
    expect(changeButton()).toHaveFocus();
    expect(changeButton()).toHaveAttribute('aria-disabled', 'true');
  });

  test('失敗したら選択を残し、もう一度押すと同じ内容で要求する', async () => {
    vi.mocked(updateApplicationStatus)
      .mockRejectedValueOnce(new ApiError('変更できません。', 429))
      .mockResolvedValueOnce({ ...jobPosting, applicationStatus: 'APPLIED', version: 4 });
    const user = await renderDetail();
    await changeStatus(user, 'APPLIED');
    await screen.findByRole('alert');

    await user.click(changeButton());

    expect(updateApplicationStatus).toHaveBeenLastCalledWith(5, { status: 'APPLIED' }, 3);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('作成中のメモの一時保存', () => {
  const memoField = () => within(memoRegion()).getByLabelText('メモ内容');

  test('入力した内容は、表示し直しても残る', async () => {
    const user = await renderDetail();
    await user.type(memoField(), '面接の質問');

    cleanup();
    await renderDetail();

    expect(memoField()).toHaveValue('面接の質問');
    expect(within(memoRegion()).getByText('5 / 250')).toBeInTheDocument();
  });

  test('登録に成功したら消える', async () => {
    vi.mocked(createJobPostingMemo).mockResolvedValue(memo(1, '面接の質問'));
    const user = await renderDetail();
    await user.type(memoField(), '面接の質問');

    await user.click(within(memoRegion()).getByRole('button', { name: '登録' }));
    await waitFor(() => expect(memoField()).toHaveValue(''));

    expect(sessionStorage.getItem(MEMO_DRAFT_KEY)).toBeNull();
  });

  test('登録に失敗したら残る', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(new ApiError('登録できません。', 500));
    const user = await renderDetail();
    await user.type(memoField(), '面接の質問');

    await user.click(within(memoRegion()).getByRole('button', { name: '登録' }));
    await within(memoRegion()).findByRole('alert');

    expect(sessionStorage.getItem(MEMO_DRAFT_KEY)).toBe('面接の質問');
  });

  test('入力を消したら一時保存も消える', async () => {
    const user = await renderDetail();
    await user.type(memoField(), 'あ');

    await user.clear(memoField());

    expect(sessionStorage.getItem(MEMO_DRAFT_KEY)).toBeNull();
  });

  test.each([
    ['別の求人', 'joblens.memo-draft.1.6'],
    ['別のユーザー', 'joblens.memo-draft.2.5'],
  ])('%sの一時保存は読まない', async (_, key) => {
    sessionStorage.setItem(key, '他の内容');

    await renderDetail();

    expect(memoField()).toHaveValue('');
  });

  test('上限より長い保存値は上限までにする', async () => {
    sessionStorage.setItem(MEMO_DRAFT_KEY, 'あ'.repeat(300));

    await renderDetail();

    expect(memoField()).toHaveValue('あ'.repeat(250));
  });

  test('ストレージを使えなくても入力できる', async () => {
    const unavailable = () => {
      throw new DOMException('使用できません', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(unavailable);
    const user = await renderDetail();

    await user.type(memoField(), 'あ');
    await user.clear(memoField());
    await user.type(memoField(), 'い');

    expect(memoField()).toHaveValue('い');
  });
});

describe('別の画面で削除されたメモ', () => {
  const MEMO_GONE = new ApiError('メモが見つかりません。', 404, 'JOB_POSTING_MEMO_NOT_FOUND');
  const POSTING_GONE = new ApiError('求人が見つかりません。', 404, 'JOB_POSTING_NOT_FOUND');

  test('削除しようとしてすでになければ、エラーにせず一覧を取り直す', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, '面談準備')]);
    vi.mocked(deleteJobPostingMemo).mockRejectedValue(MEMO_GONE);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(await within(memoRegion()).findByText('登録されたメモはありません。')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('保存しようとしてすでになければ、フォームを閉じて案内し、一覧を取り直す', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, '面談準備')]);
    vi.mocked(updateJobPostingMemo).mockRejectedValue(MEMO_GONE);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');
    await user.click(within(memoItem('面談準備')).getByRole('button', { name: '編集' }));

    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(await within(memoRegion()).findByRole('alert'))
      .toHaveTextContent('このメモは別の画面で削除されました。');
    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
    expect(await within(memoRegion()).findByText('登録されたメモはありません。')).toBeInTheDocument();
  });

  // 取り直しに失敗すると一覧にメモが残るため、存在しないメモのフォームを開いたままにしない。
  test('保存しようとしてすでになく、一覧の取り直しにも失敗してもフォームを閉じる', async () => {
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([memo(1, '面談準備')])
      .mockRejectedValueOnce(new ApiError('メモのエラー', 500));
    vi.mocked(updateJobPostingMemo).mockRejectedValue(MEMO_GONE);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');
    await user.click(within(memoItem('面談準備')).getByRole('button', { name: '編集' }));

    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    await within(memoRegion()).findByText('メモのエラー');
    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
    expect(within(memoRegion()).getByText('このメモは別の画面で削除されました。')).toBeInTheDocument();
  });

  test.each([
    ['削除', 'メモを削除'],
    ['保存', '編集'],
  ])('求人がないときの%sはサーバーのメッセージを表示し、取り直さない', async (kind, firstButton) => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    vi.mocked(deleteJobPostingMemo).mockRejectedValue(POSTING_GONE);
    vi.mocked(updateJobPostingMemo).mockRejectedValue(POSTING_GONE);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: firstButton }));
    if (kind === '保存') {
      await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));
    }

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent('求人が見つかりません。');
    expect(getJobPostingMemos).toHaveBeenCalledTimes(1);
  });

  test('編集を始めると、前の削除のエラーを消す', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(deleteJobPostingMemo).mockRejectedValue(new ApiError('削除できません。', 500));
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');
    await user.click(within(memoItem('メモA')).getByRole('button', { name: 'メモを削除' }));
    await within(memoRegion()).findByRole('alert');

    await user.click(within(memoItem('メモB')).getByRole('button', { name: '編集' }));

    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('保存を始めると、前の削除のエラーを消す', async () => {
    const saving = deferred<JobPostingMemo>();
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(deleteJobPostingMemo).mockRejectedValue(new ApiError('削除できません。', 500));
    vi.mocked(updateJobPostingMemo).mockReturnValue(saving.promise);
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');
    await user.click(within(memoItem('メモA')).getByRole('button', { name: '編集' }));
    await user.click(within(memoItem('メモB')).getByRole('button', { name: 'メモを削除' }));
    await within(memoRegion()).findByRole('alert');

    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ページ内の移動', () => {
  async function renderFromList() {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/job-postings/5', state: { listSearch: '?keyword=Java' } }]}>
        <AuthenticatedApp />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { level: 2, name: jobPosting.title });
    return userEvent.setup();
  }

  test('4つの領域へのボタンを順に表示する', async () => {
    await renderDetail();

    const navigation = screen.getByRole('navigation', { name: 'ページ内の移動' });

    expect(within(navigation).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['分析', '原文', 'メモ', '変更履歴']);
  });

  test.each([
    ['分析', '求人票の分析'],
    ['原文', '求人票の原文'],
    ['メモ', 'メモ'],
    ['変更履歴', '変更履歴'],
  ])('%sを押すと見出しへ移動し、フォーカスも移す', async (button, heading) => {
    const user = await renderDetail();
    const navigation = screen.getByRole('navigation', { name: 'ページ内の移動' });

    await user.click(within(navigation).getByRole('button', { name: button }));

    const target = screen.getByRole('heading', { level: 3, name: heading });
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([target]);
    expect(target).toHaveFocus();
  });

  // ハッシュで移動すると履歴のstateが失われ、検索条件の付いた一覧へ戻れなくなる。
  test('移動しても、検索条件の付いた一覧へ戻れる', async () => {
    const user = await renderFromList();
    const navigation = screen.getByRole('navigation', { name: 'ページ内の移動' });

    await user.click(within(navigation).getByRole('button', { name: 'メモ' }));

    expect(screen.getByRole('link', { name: '← 求人一覧に戻る' })).toHaveAttribute('href', '/?keyword=Java');
  });
});

describe('useJobPostingDetailの置き換え', () => {
  test('別の求人へ移動した後に届いた応答で、移動先の表示を上書きしない', async () => {
    const other: JobPosting = { ...jobPosting, id: 6, title: '別の求人' };
    vi.mocked(fetchJobPosting).mockImplementation(async (id) => (id === 6 ? other : jobPosting));
    const { result, rerender } = renderHook(
      ({ id }) => useJobPostingDetail(id),
      { initialProps: { id: 5 } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('loaded'));
    rerender({ id: 6 });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', jobPosting: other }));

    act(() => result.current.replaceJobPosting({ ...jobPosting, version: 4 }));

    expect(result.current.state).toEqual({ status: 'loaded', jobPosting: other });
  });
});

describe('変更履歴', () => {
  test('新しい順のまま、変更内容と日時を表示する', async () => {
    vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([
      { ...historyEntry, id: 2, fromStatus: 'APPLIED', toStatus: 'INTERVIEWING' },
      historyEntry,
    ]);
    await renderDetail();

    await within(historyRegion()).findByText(/応募済み → 面接中/);
    const items = within(historyRegion()).getAllByRole('listitem');

    expect(items[0]).toHaveTextContent('応募済み → 面接中');
    expect(items[1]).toHaveTextContent('保存済み → 応募済み');
    expect(within(items[0]).getByText(/2026/)).toBeInTheDocument();
  });

  test('履歴がなければ、ないことを表示する', async () => {
    await renderDetail();

    expect(await within(historyRegion()).findByText('変更履歴はありません。')).toBeInTheDocument();
  });

  test('取得中は読み込み中と表示する', async () => {
    vi.mocked(fetchApplicationStatusHistory).mockReturnValue(new Promise(() => {}));
    await renderDetail();

    expect(within(historyRegion()).getByText('変更履歴を読み込み中…')).toBeInTheDocument();
  });

  test('取得に失敗したら、再試行で変更履歴だけを取り直す', async () => {
    vi.mocked(fetchApplicationStatusHistory)
      .mockRejectedValueOnce(new ApiError('履歴のエラー', 500))
      .mockResolvedValueOnce([historyEntry]);
    const user = await renderDetail();
    await within(historyRegion()).findByRole('alert');

    await user.click(within(historyRegion()).getByRole('button', { name: '変更履歴を再試行' }));

    expect(await within(historyRegion()).findByText(/保存済み → 応募済み/)).toBeInTheDocument();
    expect(within(historyRegion()).queryByRole('alert')).not.toBeInTheDocument();
    expect(getJobPostingMemos).toHaveBeenCalledTimes(1);
  });

  test('変更後の取り直しに失敗しても今の履歴を残し、再読み込みできる', async () => {
    vi.mocked(fetchApplicationStatusHistory).mockResolvedValueOnce([historyEntry]);
    vi.mocked(updateApplicationStatus).mockResolvedValue({
      ...jobPosting, applicationStatus: 'APPLIED', version: 4,
    });
    const user = await renderDetail();
    await within(historyRegion()).findByText(/保存済み → 応募済み/);
    vi.mocked(fetchApplicationStatusHistory)
      .mockRejectedValueOnce(new ApiError('履歴のエラー', 500))
      .mockResolvedValueOnce([
        { ...historyEntry, id: 2, fromStatus: 'APPLIED', toStatus: 'OFFERED' },
        historyEntry,
      ]);

    await changeStatus(user, 'APPLIED');

    expect(await within(historyRegion()).findByRole('alert')).toHaveTextContent('履歴のエラー');
    expect(within(historyRegion()).getByText(/保存済み → 応募済み/)).toBeInTheDocument();

    await user.click(within(historyRegion()).getByRole('button', { name: '変更履歴を再読み込み' }));

    expect(await within(historyRegion()).findByText(/応募済み → 内定/)).toBeInTheDocument();
    expect(within(historyRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('メモの表示', () => {
  test('登録されたメモと更新日時を表示する', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    await renderDetail();

    expect(await within(memoRegion()).findByText('面談準備')).toBeInTheDocument();
    expect(memoItem('面談準備')).toHaveTextContent('更新日時:');
  });

  test('メモがなければ、ないことを表示する', async () => {
    await renderDetail();

    expect(await within(memoRegion()).findByText('登録されたメモはありません。')).toBeInTheDocument();
  });

  test('取得中は読み込み中と表示し、登録フォームは使える', async () => {
    vi.mocked(getJobPostingMemos).mockReturnValue(new Promise(() => {}));
    await renderDetail();

    expect(within(memoRegion()).getByText('メモを読み込み中…')).toBeInTheDocument();
    expect(within(memoRegion()).getByLabelText('メモ内容')).toBeEnabled();
  });

  test('取得に失敗したら、再試行で取り直す', async () => {
    vi.mocked(getJobPostingMemos)
      .mockRejectedValueOnce(new ApiError('メモのエラー', 500))
      .mockResolvedValueOnce([memo(1, '面談準備')]);
    const user = await renderDetail();
    await within(memoRegion()).findByRole('alert');

    await user.click(within(memoRegion()).getByRole('button', { name: 'メモを再試行' }));

    expect(await within(memoRegion()).findByText('面談準備')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('通信エラーの英語の文言は表示しない', async () => {
    vi.mocked(getJobPostingMemos).mockRejectedValue(NETWORK_ERROR);
    await renderDetail();

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent(/^メモの取得に失敗しました。$/);
  });
});

describe('メモの登録', () => {
  test('登録すると一覧を取り直して表示し、入力欄を空にする', async () => {
    vi.mocked(createJobPostingMemo).mockResolvedValue(memo(1, '面談準備'));
    const user = await renderDetail();
    await within(memoRegion()).findByText('登録されたメモはありません。');
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);

    await user.type(within(memoRegion()).getByLabelText('メモ内容'), '面談準備');
    await user.click(within(memoRegion()).getByRole('button', { name: '登録' }));

    expect(createJobPostingMemo).toHaveBeenCalledWith(5, { content: '面談準備' });
    expect(await within(memoRegion()).findByText('面談準備')).toBeInTheDocument();
    expect(within(memoRegion()).getByLabelText('メモ内容')).toHaveValue('');
    expect(getJobPostingMemos).toHaveBeenCalledTimes(2);
  });

  test('通信エラーの英語の文言は表示せず、入力を残す', async () => {
    vi.mocked(createJobPostingMemo).mockRejectedValue(NETWORK_ERROR);
    const user = await renderDetail();

    await user.type(within(memoRegion()).getByLabelText('メモ内容'), '面談準備');
    await user.click(within(memoRegion()).getByRole('button', { name: '登録' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent(/^不明なエラーが発生しました。$/);
    expect(within(memoRegion()).getByLabelText('メモ内容')).toHaveValue('面談準備');
  });
});

describe('メモの削除', () => {
  test('確認すると削除して一覧を取り直す', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, '面談準備')]);
    vi.mocked(deleteJobPostingMemo).mockResolvedValue();
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(deleteJobPostingMemo).toHaveBeenCalledWith(5, 1);
    expect(await within(memoRegion()).findByText('登録されたメモはありません。')).toBeInTheDocument();
  });

  test('確認でキャンセルすると削除しない', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(deleteJobPostingMemo).not.toHaveBeenCalled();
  });

  test('削除に失敗しても一覧を残し、もう一度削除できる', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    vi.mocked(deleteJobPostingMemo)
      .mockRejectedValueOnce(new ApiError('削除できません。', 500))
      .mockResolvedValueOnce();
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent('削除できません。');
    expect(within(memoRegion()).getByText('面談準備')).toBeInTheDocument();

    vi.mocked(getJobPostingMemos).mockResolvedValue([]);
    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(await within(memoRegion()).findByText('登録されたメモはありません。')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('通信エラーの英語の文言は表示しない', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    vi.mocked(deleteJobPostingMemo).mockRejectedValue(NETWORK_ERROR);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: 'メモを削除' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent(/^削除中に不明なエラーが発生しました。$/);
  });

  test('削除の完了が、別のメモの削除中の表示を消さない', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(deleteJobPostingMemo)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');

    await user.click(within(memoItem('メモA')).getByRole('button', { name: 'メモを削除' }));
    await user.click(within(memoItem('メモB')).getByRole('button', { name: 'メモを削除' }));
    await act(async () => first.resolve());

    expect(within(memoItem('メモB')).getByRole('button', { name: 'メモを削除中…' })).toBeDisabled();
  });

  test('削除の間も、別のメモの編集中の内容は消えない', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(deleteJobPostingMemo).mockResolvedValue();
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');

    await user.click(within(memoItem('メモA')).getByRole('button', { name: '編集' }));
    const editor = within(memoRegion()).getByRole('textbox', { name: 'メモを編集' });
    await user.type(editor, 'の書きかけ');
    vi.mocked(getJobPostingMemos).mockClear();

    await user.click(within(memoItem('メモB')).getByRole('button', { name: 'メモを削除' }));
    await waitFor(() => expect(getJobPostingMemos).toHaveBeenCalledTimes(1));

    expect(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' })).toHaveValue('メモAの書きかけ');
  });

  test('変更後の取り直しに失敗しても今の一覧を残し、再読み込みできる', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(deleteJobPostingMemo).mockResolvedValue();
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');
    vi.mocked(getJobPostingMemos)
      .mockRejectedValueOnce(new ApiError('メモのエラー', 500))
      .mockResolvedValueOnce([memo(2, 'メモB')]);

    await user.click(within(memoItem('メモA')).getByRole('button', { name: 'メモを削除' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent('メモのエラー');
    expect(within(memoRegion()).getByText('メモB')).toBeInTheDocument();

    await user.click(within(memoRegion()).getByRole('button', { name: 'メモを再読み込み' }));

    await waitFor(() => expect(within(memoRegion()).queryByText('メモA')).not.toBeInTheDocument());
    expect(within(memoRegion()).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('メモの編集', () => {
  test('保存すると新しい内容を受け取ってからフォームを閉じる', async () => {
    const refreshed = deferred<JobPostingMemo[]>();
    vi.mocked(getJobPostingMemos).mockResolvedValueOnce([memo(1, '古い内容')]);
    vi.mocked(updateJobPostingMemo).mockResolvedValue(memo(1, '新しい内容'));
    const user = await renderDetail();
    await within(memoRegion()).findByText('古い内容');
    vi.mocked(getJobPostingMemos).mockReturnValueOnce(refreshed.promise);

    await user.click(within(memoItem('古い内容')).getByRole('button', { name: '編集' }));
    const editor = within(memoRegion()).getByRole('textbox', { name: 'メモを編集' });
    await user.clear(editor);
    await user.type(editor, '新しい内容');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(updateJobPostingMemo).toHaveBeenCalledWith(5, 1, { content: '新しい内容' });
    await waitFor(() => expect(getJobPostingMemos).toHaveBeenCalledTimes(2));
    // 取り直しの応答まではフォームを閉じない。閉じると古い内容が一瞬見えるため。
    expect(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' })).toBeDisabled();
    expect(within(memoRegion()).queryByText('古い内容')).not.toBeInTheDocument();

    await act(async () => refreshed.resolve([memo(1, '新しい内容')]));

    expect(within(memoRegion()).getByText('新しい内容')).toBeInTheDocument();
    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
  });

  test('キャンセルすると保存しない', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: '編集' }));
    await user.click(within(memoRegion()).getByRole('button', { name: 'キャンセル' }));

    expect(updateJobPostingMemo).not.toHaveBeenCalled();
    expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument();
  });

  test('保存に失敗したらフォームと入力を残してエラーを表示する', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    vi.mocked(updateJobPostingMemo).mockRejectedValue(new ApiError('メモの編集に失敗しました。', 500));
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: '編集' }));
    await user.type(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' }), '追記');
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent('メモの編集に失敗しました。');
    expect(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' })).toHaveValue('面談準備追記');
    expect(getJobPostingMemos).toHaveBeenCalledTimes(1);
  });

  test('通信エラーの英語の文言は表示しない', async () => {
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, '面談準備')]);
    vi.mocked(updateJobPostingMemo).mockRejectedValue(NETWORK_ERROR);
    const user = await renderDetail();
    await within(memoRegion()).findByText('面談準備');

    await user.click(within(memoItem('面談準備')).getByRole('button', { name: '編集' }));
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

    expect(await within(memoRegion()).findByRole('alert')).toHaveTextContent(/^編集中に不明なエラーが発生しました。$/);
  });

  test('保存の完了が、別のメモの編集を閉じない', async () => {
    const saving = deferred<JobPostingMemo>();
    vi.mocked(getJobPostingMemos).mockResolvedValue([memo(1, 'メモA'), memo(2, 'メモB')]);
    vi.mocked(updateJobPostingMemo).mockReturnValueOnce(saving.promise);
    const user = await renderDetail();
    await within(memoRegion()).findByText('メモA');

    await user.click(within(memoItem('メモA')).getByRole('button', { name: '編集' }));
    await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));
    await user.click(within(memoItem('メモB')).getByRole('button', { name: '編集' }));
    await user.type(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' }), 'の追記');

    await act(async () => saving.resolve(memo(1, 'メモA')));

    expect(within(memoRegion()).getByRole('textbox', { name: 'メモを編集' })).toHaveValue('メモBの追記');
  });
});
