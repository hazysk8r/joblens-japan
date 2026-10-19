import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateJobPosting,
} from '../api/jobPostingApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const fields = [
  ['companyName', '회사명'],
  ['title', '공고 제목'],
  ['sourceUrl', '공고 URL'],
  ['originalText', '공고 원문'],
  ['salaryMin', '최저 월급'],
  ['salaryMax', '최고 월급'],
  ['applicationDeadline', '締切日'],
] as const;

const postingA: JobPosting = {
  id: 1,
  companyName: '札幌クラウド',
  title: '求人A',
  sourceUrl: 'https://example.com/jobs/1',
  originalText: '編集開始時の求人原文',
  createdAt: '2026-10-05T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: 300000,
  salaryMax: 500000,
  applicationDeadline: '2026-12-01',
  version: 3,
};
const postingB: JobPosting = { ...postingA, id: 2, title: '求人B', version: 7 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function pageOf(...postings: JobPosting[]): PageResponse<JobPosting> {
  return {
    content: postings,
    page: 0,
    size: 5,
    totalElements: postings.length,
    totalPages: postings.length ? 1 : 0,
    first: true,
    last: true,
  };
}

function validationError(fieldErrors: Record<string, string>, message = '入力内容を確認してください。') {
  return new ApiError(message, 400, 'VALIDATION_ERROR', fieldErrors);
}

function conflict() {
  return new ApiError('JobPosting version conflict', 412, 'JOB_POSTING_VERSION_CONFLICT');
}

function cardFor(title: string) {
  const card = screen.getByRole('heading', { name: title, level: 2 }).closest('li');
  if (!card) throw new Error(`求人カードが見つかりません: ${title}`);
  return card;
}

async function renderPostings(...postings: JobPosting[]) {
  vi.mocked(fetchJobPostings).mockResolvedValue(pageOf(...postings));
  render(<MemoryRouter><App /></MemoryRouter>);
  await screen.findByRole('heading', { name: postings[0].title, level: 2 });
}

async function startEdit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '수정' }));
}

async function submit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '저장' }));
}

async function replaceTitle(user: ReturnType<typeof userEvent.setup>, card: HTMLElement, title: string) {
  const input = within(card).getByRole('textbox', { name: '공고 제목' });
  await user.clear(input);
  await user.type(input, title);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 2, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  vi.mocked(updateJobPosting).mockResolvedValue({ ...postingA, version: 4 });
});

afterEach(cleanup);

describe('編集フォームのフィールドエラー', () => {
  test('七つのフィールドのエラーを対応する入力欄に関連付け、一般エラーも表示する', async () => {
    const user = userEvent.setup();
    const errors = Object.fromEntries(fields.map(([field]) => [field, `${field}の入力エラー`]));
    vi.mocked(updateJobPosting).mockRejectedValueOnce(validationError(errors));
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);

    for (const [, label] of fields) {
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
    await submit(user, card);

    expect(await screen.findByRole('alert')).toHaveTextContent('入力内容を確認してください。');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    for (const [field, label] of fields) {
      const input = within(card).getByLabelText(label);
      const message = within(card).getByText(errors[field]);
      expect(message).toHaveAttribute('id', `edit-${postingA.id}-${field}-error`);
      expect(message).not.toHaveAttribute('role', 'alert');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', message.id);
      expect(input).toHaveAccessibleDescription(errors[field]);
    }
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(within(card).getByRole('button', { name: '저장' })).toBeEnabled();
  });

  test.each<{ name: string; errors: Record<string, string> }>([
    { name: '未知のフィールドだけの場合', errors: { serverOnly: '未対応のフィールドエラー' } },
    { name: '既知と未知のフィールドが混在する場合', errors: { title: 'タイトルを確認してください。', serverOnly: '未対応のフィールドエラー' } },
  ])('$nameも一般エラーを維持する', async ({ errors }) => {
    const user = userEvent.setup();
    vi.mocked(updateJobPosting).mockRejectedValueOnce(validationError(errors));
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    await submit(user, card);

    expect(await screen.findByRole('alert')).toHaveTextContent('入力内容を確認してください。');
    expect(screen.queryByText('未対応のフィールドエラー')).not.toBeInTheDocument();
    if (errors.title) {
      expect(within(card).getByLabelText('공고 제목')).toHaveAccessibleDescription(errors.title);
    } else {
      expect(within(card).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    }
  });

  test.each([
    { name: 'フィールドを持たないAPIエラー', error: new ApiError('サーバーエラー', 503), message: 'サーバーエラー' },
    { name: '通信エラー', error: new TypeError('Failed to fetch'), message: 'Failed to fetch' },
  ])('$nameでは入力内容と一般エラーを保持する', async ({ error, message }) => {
    const user = userEvent.setup();
    vi.mocked(updateJobPosting).mockRejectedValueOnce(error);
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    await replaceTitle(user, card, '保持する編集内容');
    await submit(user, card);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(within(card).getByLabelText('공고 제목')).toHaveValue('保持する編集内容');
    for (const [, label] of fields) {
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
  });

  test('入力変更ではエラーを保持し、再保存開始で消去して次の失敗の内容に置き換える', async () => {
    const user = userEvent.setup();
    const retry = deferred<JobPosting>();
    vi.mocked(updateJobPosting)
      .mockRejectedValueOnce(validationError({ title: '旧タイトルエラー', salaryMin: '旧最低給与エラー' }, '一回目の検証エラー'))
      .mockReturnValueOnce(retry.promise);
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    await submit(user, card);
    await screen.findByText('旧タイトルエラー');

    await replaceTitle(user, card, '再保存するタイトル');
    await user.selectOptions(within(card).getByLabelText('최저 월급'), '350000');
    expect(within(card).getByLabelText('공고 제목')).toHaveAccessibleDescription('旧タイトルエラー');
    expect(within(card).getByLabelText('최저 월급')).toHaveAccessibleDescription('旧最低給与エラー');
    await submit(user, card);
    expect(within(card).getByRole('button', { name: '저장 중...' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('旧タイトルエラー')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(within(card).getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }

    await act(async () => retry.reject(validationError({ salaryMax: '新しい最高給与エラー' }, '二回目の検証エラー')));
    expect(screen.getByRole('alert')).toHaveTextContent('二回目の検証エラー');
    expect(within(card).getByLabelText('최고 월급')).toHaveAccessibleDescription('新しい最高給与エラー');
    expect(within(card).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    expect(within(card).getByLabelText('최저 월급')).not.toHaveAttribute('aria-invalid');
    expect(within(card).getByLabelText('공고 제목')).toHaveValue('再保存するタイトル');
    expect(within(card).getByLabelText('최저 월급')).toHaveValue('350000');
    expect(within(card).getByLabelText('최고 월급')).toHaveValue('500000');
    expect(within(card).getByLabelText('회사명')).toHaveValue(postingA.companyName);
    expect(within(card).getByLabelText('공고 URL')).toHaveValue(postingA.sourceUrl);
    expect(within(card).getByLabelText('공고 원문')).toHaveValue(postingA.originalText);
    expect(within(card).getByLabelText('締切日')).toHaveValue(postingA.applicationDeadline);
    expect(updateJobPosting).toHaveBeenLastCalledWith(
      postingA.id, expect.objectContaining({ title: '再保存するタイトル', salaryMin: 350000 }), postingA.version,
    );
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
  });

  test('キャンセル後の再編集と別求人の新規セッションにはエラーを引き継がない', async () => {
    const user = userEvent.setup();
    vi.mocked(updateJobPosting).mockRejectedValue(validationError({ title: '引き継がないエラー' }));
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    await startEdit(user, cardA);
    await submit(user, cardA);
    await screen.findByText('引き継がないエラー');
    await user.click(within(cardA).getByRole('button', { name: '취소' }));
    await startEdit(user, cardA);
    expect(within(cardA).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('引き継がないエラー')).not.toBeInTheDocument();
    await submit(user, cardA);
    await screen.findByText('引き継がないエラー');
    await startEdit(user, cardB);
    expect(within(cardB).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('引き継がないエラー')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each(['別求人B', '同じ求人Aの再編集'] as const)('古い400応答は%sの現在のフィールドエラーを上書きしない', async (target) => {
    const user = userEvent.setup();
    const oldSave = deferred<JobPosting>();
    vi.mocked(updateJobPosting)
      .mockReturnValueOnce(oldSave.promise)
      .mockRejectedValueOnce(validationError({ title: '現在のタイトルエラー' }, '現在の検証エラー'));
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    await startEdit(user, cardA);
    await submit(user, cardA);
    await startEdit(user, cardB);
    const currentCard = target === '別求人B' ? cardB : cardA;
    if (currentCard === cardA) await startEdit(user, cardA);
    await replaceTitle(user, currentCard, '現在のセッションの下書き');
    await submit(user, currentCard);
    await screen.findByText('現在のタイトルエラー');

    await act(async () => oldSave.reject(validationError({ salaryMax: '古い最高給与エラー' }, '古い検証エラー')));
    expect(within(currentCard).getByLabelText('공고 제목')).toHaveAccessibleDescription('現在のタイトルエラー');
    expect(within(currentCard).getByLabelText('공고 제목')).toHaveValue('現在のセッションの下書き');
    expect(screen.getByRole('alert')).toHaveTextContent('現在の検証エラー');
    expect(screen.queryByText('古い最高給与エラー')).not.toBeInTheDocument();
    expect(within(currentCard).getByRole('button', { name: '저장' })).toBeEnabled();
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
  });

  test.each(['成功', '412'] as const)('旧A保存の遅い%s応答は新Aセッションの下書きとフィールドエラーを消さない', async (outcome) => {
    const user = userEvent.setup();
    const oldSave = deferred<JobPosting>();
    vi.mocked(updateJobPosting)
      .mockReturnValueOnce(oldSave.promise)
      .mockRejectedValueOnce(validationError({ title: '新Aのタイトルエラー' }, '新Aの検証エラー'));
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    await startEdit(user, cardA);
    await submit(user, cardA);
    await startEdit(user, cardB);
    await startEdit(user, cardA);
    await replaceTitle(user, cardA, '新Aの入力内容');
    await submit(user, cardA);
    await screen.findByText('新Aのタイトルエラー');
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf({ ...postingA, version: 9 }, postingB));

    await act(async () => {
      if (outcome === '成功') oldSave.resolve({ ...postingA, version: 4 });
      else oldSave.reject(conflict());
    });
    expect(within(cardA).getByLabelText('공고 제목')).toHaveValue('新Aの入力内容');
    expect(within(cardA).getByLabelText('공고 제목')).toHaveAccessibleDescription('新Aのタイトルエラー');
    expect(screen.getByRole('alert')).toHaveTextContent('新Aの検証エラー');
    expect(within(cardA).getByRole('button', { name: '저장' })).toBeEnabled();
    expect(updateJobPosting).toHaveBeenCalledTimes(2);
  });

  test('古い400応答のfinallyは新Aセッションの再保存状態を解除しない', async () => {
    const user = userEvent.setup();
    const oldSave = deferred<JobPosting>();
    const currentSave = deferred<JobPosting>();
    vi.mocked(updateJobPosting)
      .mockReturnValueOnce(oldSave.promise)
      .mockRejectedValueOnce(validationError({ title: '再保存前のエラー' }))
      .mockReturnValueOnce(currentSave.promise);
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    await startEdit(user, cardA);
    await submit(user, cardA);
    await startEdit(user, cardB);
    await startEdit(user, cardA);
    await submit(user, cardA);
    await screen.findByText('再保存前のエラー');
    await submit(user, cardA);
    await act(async () => oldSave.reject(validationError({ title: '古い応答のエラー' })));

    expect(within(cardA).getByRole('button', { name: '저장 중...' })).toBeDisabled();
    expect(within(cardA).getByLabelText('공고 제목')).toBeDisabled();
    expect(screen.queryByText('古い応答のエラー')).not.toBeInTheDocument();
    expect(screen.queryByText('再保存前のエラー')).not.toBeInTheDocument();
    await act(async () => currentSave.resolve({ ...postingA, version: 4 }));
  });

  test('検証エラー後の現在セッションの412ではフォームを終了して最新データを復旧し、自動再保存しない', async () => {
    const user = userEvent.setup();
    const recovery = deferred<PageResponse<JobPosting>>();
    vi.mocked(updateJobPosting)
      .mockRejectedValueOnce(validationError({ title: '復旧時に消去するエラー' }))
      .mockRejectedValueOnce(conflict());
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    await submit(user, card);
    await screen.findByText('復旧時に消去するエラー');
    vi.mocked(fetchJobPostings).mockReturnValueOnce(recovery.promise);
    await submit(user, card);

    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    expect(within(card).queryByRole('textbox', { name: '공고 제목' })).not.toBeInTheDocument();
    expect(screen.queryByText('復旧時に消去するエラー')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '수정' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('다른 화면에서 채용공고가 수정되었습니다.');
    await act(async () => recovery.resolve(pageOf({ ...postingA, version: 9 })));
    expect(updateJobPosting).toHaveBeenCalledTimes(2);
    await startEdit(user, card);
    expect(within(card).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    await submit(user, card);
    expect(updateJobPosting).toHaveBeenLastCalledWith(postingA.id, expect.any(Object), 9);
  });

  test('検証エラー後の再保存成功ではフォームとエラーを終了して一覧を更新する', async () => {
    const user = userEvent.setup();
    vi.mocked(updateJobPosting)
      .mockRejectedValueOnce(validationError({ title: '成功時に消去するエラー' }))
      .mockResolvedValueOnce({ ...postingA, version: 4 });
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    await submit(user, card);
    await screen.findByText('成功時に消去するエラー');
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf({ ...postingA, title: '更新済みの求人', version: 4 }));
    await submit(user, card);

    expect(await screen.findByRole('heading', { name: '更新済みの求人', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '공고 제목' })).not.toBeInTheDocument();
    expect(screen.queryByText('成功時に消去するエラー')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchJobPostings).toHaveBeenCalledTimes(2);
  });

  test('保存成功後の一覧取得失敗をフィールドエラーとして扱わない', async () => {
    const user = userEvent.setup();
    await renderPostings(postingA);
    const card = cardFor(postingA.title);
    await startEdit(user, card);
    vi.mocked(fetchJobPostings).mockRejectedValueOnce(validationError({ title: '一覧APIのフィールド情報' }, '一覧の更新に失敗しました。'));
    await submit(user, card);

    expect(await screen.findByRole('alert')).toHaveTextContent('一覧の更新に失敗しました。');
    expect(screen.queryByRole('textbox', { name: '공고 제목' })).not.toBeInTheDocument();
    expect(screen.queryByText('一覧APIのフィールド情報')).not.toBeInTheDocument();
    await startEdit(user, card);
    expect(within(card).getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
  });
});
