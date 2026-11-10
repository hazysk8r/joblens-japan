import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import JobPostingEditForm from '../components/JobPostingEditForm';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateJobPosting,
} from '../api/jobPostingApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const CONFLICT_MESSAGE = '別の画面で求人が編集されました。';
const RECOVERY_MESSAGE = '最新の求人を読み込めませんでした。再読み込みしてから編集してください。';
const RETRY_NAME = '最新の求人を再読み込み';

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
    originalText: '編集開始時の求人原文',
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
const postingB = posting({ id: 2, title: '求人B', version: 7 });

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

function conflict() {
  return new ApiError('JobPosting version conflict', 412, 'JOB_POSTING_VERSION_CONFLICT');
}

// 求人タイトルをもとに、該当する求人カードを取得する。
function cardFor(title: string) {
  const card = screen.getByRole('heading', { name: title, level: 2 }).closest('li');
  if (!card) {
    throw new Error(`求人カードが見つかりません: ${title}`);
  }
  return card;
}

async function renderPostings(...postings: JobPosting[]) {
  vi.mocked(fetchJobPostings).mockResolvedValue(pageOf(...postings));
  render(
    <MemoryRouter>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: postings[0].title, level: 2 });
}

async function replaceTitle(user: ReturnType<typeof userEvent.setup>, card: HTMLElement, title: string) {
  const titleInput = within(card).getByRole('textbox', { name: '求人タイトル' });
  await user.clear(titleInput);
  await user.type(titleInput, title);
}

async function beginEdit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '編集' }));
}

async function submitEdit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '保存' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 2,
    applied: 0,
    interviewing: 0,
    offered: 0,
    rejected: 0,
  });
  vi.mocked(updateJobPosting).mockResolvedValue(posting({ version: 4 }));
});

afterEach(() => {
  cleanup();
});

describe('編集開始時のversion', () => {
  test('propsが更新されても入力の下書きと編集開始時のversionで保存する', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <JobPostingEditForm jobPosting={postingA} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    await user.clear(screen.getByRole('textbox', { name: '求人タイトル' }));
    await user.type(screen.getByRole('textbox', { name: '求人タイトル' }), '自分の編集中タイトル');

    rerender(
      <JobPostingEditForm
        jobPosting={posting({ version: 9, originalText: '別画面で更新された原文', salaryMin: 400000 })}
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('textbox', { name: '求人原文' })).toHaveValue(postingA.originalText);
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledWith(
      postingA.id,
      expect.objectContaining({
        title: '自分の編集中タイトル',
        originalText: postingA.originalText,
        salaryMin: postingA.salaryMin,
      }),
      postingA.version,
    );
  });

  test('新しいセッションでフォームが作り直されると最新の項目とversionで始まる', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <JobPostingEditForm key="session-1" jobPosting={postingA} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    await user.clear(screen.getByRole('textbox', { name: '求人タイトル' }));
    await user.type(screen.getByRole('textbox', { name: '求人タイトル' }), '破棄する旧下書き');
    const latest = posting({ title: '最新タイトル', originalText: '最新原文', salaryMin: 400000, version: 9 });
    rerender(
      <JobPostingEditForm key="session-2" jobPosting={latest} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    expect(screen.getByRole('textbox', { name: '求人タイトル' })).toHaveValue(latest.title);
    expect(screen.getByRole('textbox', { name: '求人原文' })).toHaveValue(latest.originalText);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith(latest.id, expect.objectContaining({ title: latest.title }), latest.version);
  });
});

describe('412の復旧', () => {
  test('再取得がまだpendingでも412ですぐフォームを閉じ、自動で再保存しない', async () => {
    const recovery = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderPostings(postingA);
    const cardA = cardFor(postingA.title);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '破棄する旧下書き');
    vi.mocked(updateJobPosting).mockRejectedValueOnce(conflict());
    vi.mocked(fetchJobPostings).mockReturnValueOnce(recovery.promise);

    await submitEdit(user, cardA);
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('textbox', { name: '求人タイトル' })).not.toBeInTheDocument();
    expect(within(cardA).getByRole('button', { name: '編集' })).toBeDisabled();
    expect(within(cardA).getByText('最新の求人を再読み込み中…')).toHaveAttribute('role', 'status');
    expect(screen.getByText(CONFLICT_MESSAGE)).toBeInTheDocument();
    expect(updateJobPosting).toHaveBeenCalledTimes(1);

    await act(async () => recovery.resolve(pageOf(posting({ version: 5 }))));
    expect(updateJobPosting).toHaveBeenCalledTimes(1);
  });

  test('復旧に失敗すると再編集を止め、再試行の成功後に最新の項目とversionで保存する', async () => {
    const recovery = deferred<PageResponse<JobPosting>>();
    const retry = deferred<PageResponse<JobPosting>>();
    const latest = posting({ title: '最新タイトル', originalText: '最新原文', salaryMin: 400000, version: 8 });
    const user = userEvent.setup();
    await renderPostings(postingA);
    const cardA = cardFor(postingA.title);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '破棄する旧下書き');
    vi.mocked(updateJobPosting).mockRejectedValueOnce(conflict());
    vi.mocked(fetchJobPostings).mockReturnValueOnce(recovery.promise).mockReturnValueOnce(retry.promise);

    await submitEdit(user, cardA);
    await act(async () => recovery.reject(new Error('復旧GET失敗')));
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    expect(within(cardA).getByRole('button', { name: '編集' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: '求人タイトル' })).not.toBeInTheDocument();
    await user.click(within(cardA).getByRole('button', { name: RETRY_NAME }));
    expect(within(cardA).getByRole('button', { name: '編集' })).toBeDisabled();
    await act(async () => retry.resolve(pageOf(latest)));

    await beginEdit(user, cardA);
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveValue(latest.title);
    expect(within(cardA).getByRole('textbox', { name: '求人原文' })).toHaveValue(latest.originalText);
    expect(within(cardA).getByRole('combobox', { name: '最低月給' })).toHaveValue('400000');
    await submitEdit(user, cardA);
    expect(updateJobPosting).toHaveBeenLastCalledWith(
      latest.id,
      expect.objectContaining({ title: latest.title, originalText: latest.originalText, salaryMin: latest.salaryMin }),
      latest.version,
    );
  });

  test('Aの遅い412と復旧の失敗が編集中のBの下書きを消さない', async () => {
    const saveA = deferred<JobPosting>();
    const recovery = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    vi.mocked(updateJobPosting).mockReturnValueOnce(saveA.promise);
    await beginEdit(user, cardA);
    await submitEdit(user, cardA);
    await beginEdit(user, cardB);
    await replaceTitle(user, cardB, 'Bの保存前の下書き');
    vi.mocked(fetchJobPostings).mockReturnValueOnce(recovery.promise);

    await act(async () => saveA.reject(conflict()));
    expect(within(cardB).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('Bの保存前の下書き');
    await act(async () => recovery.reject(new Error('復旧GET失敗')));
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    expect(within(cardB).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('Bの保存前の下書き');
    expect(within(cardB).getByRole('button', { name: '保存' })).toBeEnabled();
    expect(within(cardA).getByRole('button', { name: '編集' })).toBeDisabled();
  });

  test('Aの以前の保存が遅れて412を返しても、新しいAのセッションとその開始versionを維持する', async () => {
    const previousSave = deferred<JobPosting>();
    const recovery = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    vi.mocked(updateJobPosting).mockReturnValueOnce(previousSave.promise);
    await beginEdit(user, cardA);
    await submitEdit(user, cardA);
    await beginEdit(user, cardB);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '新しいAセッションの下書き');
    vi.mocked(fetchJobPostings).mockReturnValueOnce(recovery.promise);

    await act(async () => previousSave.reject(conflict()));
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('新しいAセッションの下書き');
    await act(async () => recovery.resolve(pageOf(posting({ version: 9 }), postingB)));
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('新しいAセッションの下書き');
    await submitEdit(user, cardA);
    expect(updateJobPosting).toHaveBeenLastCalledWith(
      postingA.id,
      expect.objectContaining({ title: '新しいAセッションの下書き' }),
      postingA.version,
    );
  });

  test('新しいrecoveryの失敗後に以前のrecoveryの応答が届いても、再編集の制限を解除しない', async () => {
    const previousSave = deferred<JobPosting>();
    const currentSave = deferred<JobPosting>();
    const previousRecovery = deferred<PageResponse<JobPosting>>();
    const currentRecovery = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    vi.mocked(updateJobPosting).mockReturnValueOnce(previousSave.promise).mockReturnValueOnce(currentSave.promise);
    await beginEdit(user, cardA);
    await submitEdit(user, cardA);
    await beginEdit(user, cardB);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '新しいAセッションの下書き');
    await submitEdit(user, cardA);
    vi.mocked(fetchJobPostings)
      .mockReturnValueOnce(previousRecovery.promise)
      .mockReturnValueOnce(currentRecovery.promise);

    await act(async () => previousSave.reject(conflict()));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    await act(async () => currentSave.reject(conflict()));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(3));
    await act(async () => currentRecovery.reject(new Error('最新の復旧GET失敗')));
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    await act(async () => previousRecovery.resolve(pageOf(posting({ title: '古い復旧結果', version: 4 }), postingB)));

    expect(within(cardA).getByRole('button', { name: '編集' })).toBeDisabled();
    expect(within(cardA).getByRole('button', { name: RETRY_NAME })).toBeEnabled();
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '古い復旧結果', level: 2 })).not.toBeInTheDocument();
  });
});

describe('保存完了時のセッション保護', () => {
  test('現在のセッションの通常の保存失敗ではフォームと入力を維持する', async () => {
    const user = userEvent.setup();
    await renderPostings(postingA);
    const cardA = cardFor(postingA.title);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '失敗後も保持する下書き');
    vi.mocked(updateJobPosting).mockRejectedValueOnce(new ApiError('通常の保存失敗', 500));
    await submitEdit(user, cardA);

    expect(await screen.findByRole('alert')).toHaveTextContent('通常の保存失敗');
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('失敗後も保持する下書き');
    expect(within(cardA).getByRole('button', { name: '保存' })).toBeEnabled();
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: RETRY_NAME })).not.toBeInTheDocument();
  });

  test('以前のAの通常のエラーとfinallyが新しいAの保存状態を解除しない', async () => {
    const previousSave = deferred<JobPosting>();
    const currentSave = deferred<JobPosting>();
    const user = userEvent.setup();
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    vi.mocked(updateJobPosting).mockReturnValueOnce(previousSave.promise).mockReturnValueOnce(currentSave.promise);
    await beginEdit(user, cardA);
    await submitEdit(user, cardA);
    await beginEdit(user, cardB);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '保存中の新しい下書き');
    await submitEdit(user, cardA);

    await act(async () => previousSave.reject(new Error('以前のセッションの保存失敗')));
    expect(screen.queryByText('以前のセッションの保存失敗')).not.toBeInTheDocument();
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('保存中の新しい下書き');
    expect(within(cardA).getByRole('button', { name: '保存中…' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(cardA).getByRole('textbox', { name: '求人タイトル' })).toHaveAttribute('readonly');
    await act(async () => currentSave.resolve(posting({ version: 4 })));
  });

  test('Aの遅い成功の後にBが一覧から外れても編集の下書きを維持する', async () => {
    const saveA = deferred<JobPosting>();
    const refresh = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    await renderPostings(postingA, postingB);
    const cardA = cardFor(postingA.title);
    const cardB = cardFor(postingB.title);
    vi.mocked(updateJobPosting).mockReturnValueOnce(saveA.promise);
    await beginEdit(user, cardA);
    await submitEdit(user, cardA);
    await beginEdit(user, cardB);
    await replaceTitle(user, cardB, 'Bの保存前の下書き');
    vi.mocked(fetchJobPostings).mockReturnValueOnce(refresh.promise);

    await act(async () => saveA.resolve(posting({ version: 4 })));
    expect(within(cardB).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('Bの保存前の下書き');
    await act(async () => refresh.resolve(pageOf(posting({ version: 4 }))));
    expect(within(cardB).getByRole('textbox', { name: '求人タイトル' })).toHaveValue('Bの保存前の下書き');
    await user.click(within(cardB).getByRole('button', { name: 'キャンセル' }));
    expect(cardB).not.toBeInTheDocument();
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
