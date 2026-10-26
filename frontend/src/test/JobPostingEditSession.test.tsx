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

const CONFLICT_MESSAGE = '다른 화면에서 채용공고가 수정되었습니다.';
const RECOVERY_MESSAGE = '최신 공고를 불러오지 못했습니다. 다시 불러온 후 수정해 주세요.';
const RETRY_NAME = '최신 공고 다시 불러오기';

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
  const titleInput = within(card).getByRole('textbox', { name: '공고 제목' });
  await user.clear(titleInput);
  await user.type(titleInput, title);
}

async function beginEdit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '수정' }));
}

async function submitEdit(user: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  await user.click(within(card).getByRole('button', { name: '저장' }));
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

describe('편집 시작 version', () => {
  test('props가 갱신되어도 입력 초안과 편집 시작 version으로 저장한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <JobPostingEditForm jobPosting={postingA} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    await user.clear(screen.getByRole('textbox', { name: '공고 제목' }));
    await user.type(screen.getByRole('textbox', { name: '공고 제목' }), '自分の編集中タイトル');

    rerender(
      <JobPostingEditForm
        jobPosting={posting({ version: 9, originalText: '別画面で更新された原文', salaryMin: 400000 })}
        saving={false}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('textbox', { name: '공고 원문' })).toHaveValue(postingA.originalText);
    await user.click(screen.getByRole('button', { name: '저장' }));

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

  test('새 세션으로 폼이 다시 생성되면 최신 필드와 version으로 시작한다', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <JobPostingEditForm key="session-1" jobPosting={postingA} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    await user.clear(screen.getByRole('textbox', { name: '공고 제목' }));
    await user.type(screen.getByRole('textbox', { name: '공고 제목' }), '破棄する旧下書き');
    const latest = posting({ title: '最新タイトル', originalText: '最新原文', salaryMin: 400000, version: 9 });
    rerender(
      <JobPostingEditForm key="session-2" jobPosting={latest} saving={false} onSave={onSave} onCancel={onCancel} />,
    );
    expect(screen.getByRole('textbox', { name: '공고 제목' })).toHaveValue(latest.title);
    expect(screen.getByRole('textbox', { name: '공고 원문' })).toHaveValue(latest.originalText);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith(latest.id, expect.objectContaining({ title: latest.title }), latest.version);
  });
});

describe('412 복구', () => {
  test('재조회가 아직 pending이어도 412 즉시 폼을 종료하고 자동 재저장하지 않는다', async () => {
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
    expect(screen.queryByRole('textbox', { name: '공고 제목' })).not.toBeInTheDocument();
    expect(within(cardA).getByRole('button', { name: '수정' })).toBeDisabled();
    expect(within(cardA).getByText('최신 공고를 다시 불러오는 중...')).toHaveAttribute('role', 'status');
    expect(screen.getByText(CONFLICT_MESSAGE)).toBeInTheDocument();
    expect(updateJobPosting).toHaveBeenCalledTimes(1);

    await act(async () => recovery.resolve(pageOf(posting({ version: 5 }))));
    expect(updateJobPosting).toHaveBeenCalledTimes(1);
  });

  test('복구 실패 시 재편집을 막고 재시도 성공 후 최신 필드와 version으로 저장한다', async () => {
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
    expect(within(cardA).getByRole('button', { name: '수정' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: '공고 제목' })).not.toBeInTheDocument();
    await user.click(within(cardA).getByRole('button', { name: RETRY_NAME }));
    expect(within(cardA).getByRole('button', { name: '수정' })).toBeDisabled();
    await act(async () => retry.resolve(pageOf(latest)));

    await beginEdit(user, cardA);
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toHaveValue(latest.title);
    expect(within(cardA).getByRole('textbox', { name: '공고 원문' })).toHaveValue(latest.originalText);
    expect(within(cardA).getByRole('combobox', { name: '최저 월급' })).toHaveValue('400000');
    await submitEdit(user, cardA);
    expect(updateJobPosting).toHaveBeenLastCalledWith(
      latest.id,
      expect.objectContaining({ title: latest.title, originalText: latest.originalText, salaryMin: latest.salaryMin }),
      latest.version,
    );
  });

  test('A의 늦은 412와 복구 실패가 편집 중인 B의 입력 초안을 지우지 않는다', async () => {
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
    expect(within(cardB).getByRole('textbox', { name: '공고 제목' })).toHaveValue('Bの保存前の下書き');
    await act(async () => recovery.reject(new Error('復旧GET失敗')));
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    expect(within(cardB).getByRole('textbox', { name: '공고 제목' })).toHaveValue('Bの保存前の下書き');
    expect(within(cardB).getByRole('button', { name: '저장' })).toBeEnabled();
    expect(within(cardA).getByRole('button', { name: '수정' })).toBeDisabled();
  });

  test('A의 이전 저장이 늦게 412를 반환해도 새 A 세션과 그 시작 version을 유지한다', async () => {
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
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toHaveValue('新しいAセッションの下書き');
    await act(async () => recovery.resolve(pageOf(posting({ version: 9 }), postingB)));
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toHaveValue('新しいAセッションの下書き');
    await submitEdit(user, cardA);
    expect(updateJobPosting).toHaveBeenLastCalledWith(
      postingA.id,
      expect.objectContaining({ title: '新しいAセッションの下書き' }),
      postingA.version,
    );
  });

  test('새 recovery가 실패한 뒤 이전 recovery 응답이 도착해도 재편집 제한을 해제하지 않는다', async () => {
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

    expect(within(cardA).getByRole('button', { name: '수정' })).toBeDisabled();
    expect(within(cardA).getByRole('button', { name: RETRY_NAME })).toBeEnabled();
    expect(screen.getByText(RECOVERY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '古い復旧結果', level: 2 })).not.toBeInTheDocument();
  });
});

describe('저장 완료의 세션 보호', () => {
  test('현재 세션의 일반 저장 실패에서는 폼과 입력을 유지한다', async () => {
    const user = userEvent.setup();
    await renderPostings(postingA);
    const cardA = cardFor(postingA.title);
    await beginEdit(user, cardA);
    await replaceTitle(user, cardA, '失敗後も保持する下書き');
    vi.mocked(updateJobPosting).mockRejectedValueOnce(new Error('일반 저장 실패'));
    await submitEdit(user, cardA);

    expect(await screen.findByRole('alert')).toHaveTextContent('일반 저장 실패');
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toHaveValue('失敗後も保持する下書き');
    expect(within(cardA).getByRole('button', { name: '저장' })).toBeEnabled();
    expect(fetchJobPostings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: RETRY_NAME })).not.toBeInTheDocument();
  });

  test('이전 A의 일반 오류와 finally가 새 A의 저장 상태를 해제하지 않는다', async () => {
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

    await act(async () => previousSave.reject(new Error('이전 세션의 저장 실패')));
    expect(screen.queryByText('이전 세션의 저장 실패')).not.toBeInTheDocument();
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toHaveValue('保存中の新しい下書き');
    expect(within(cardA).getByRole('button', { name: '저장 중...' })).toBeDisabled();
    expect(within(cardA).getByRole('textbox', { name: '공고 제목' })).toBeDisabled();
    await act(async () => currentSave.resolve(posting({ version: 4 })));
  });

  test('A의 늦은 성공 후 B가 목록에서 빠져도 편집 초안을 유지한다', async () => {
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
    expect(within(cardB).getByRole('textbox', { name: '공고 제목' })).toHaveValue('Bの保存前の下書き');
    await act(async () => refresh.resolve(pageOf(posting({ version: 4 }))));
    expect(within(cardB).getByRole('textbox', { name: '공고 제목' })).toHaveValue('Bの保存前の下書き');
    await user.click(within(cardB).getByRole('button', { name: '취소' }));
    expect(cardB).not.toBeInTheDocument();
  });
});

describe('목록 조회 경로의 응답 순서', () => {
  test('초기 조회가 pending이어도 새 POP 응답이 표시되고 로딩 상태가 종료된다', async () => {
    const initial = deferred<PageResponse<JobPosting>>();
    const history = deferred<PageResponse<JobPosting>>();
    function HistoryControl() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>테스트 뒤로가기</button>;
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
    await user.click(screen.getByRole('button', { name: '테스트 뒤로가기' }));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    await act(async () => history.resolve(pageOf(posting({ title: '戻る操作の最新結果' }))));

    expect(screen.getByRole('heading', { name: '戻る操作の最新結果', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '검색' })).toBeEnabled();
    expect(screen.queryByText('채용공고를 불러오는 중...')).not.toBeInTheDocument();
    await act(async () => initial.resolve(pageOf(posting({ title: '遅い初期結果' }))));
    expect(screen.getByRole('heading', { name: '戻る操作の最新結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い初期結果', level: 2 })).not.toBeInTheDocument();
  });

  test('초기 조회가 늦게 끝나도 최신 정렬 결과를 덮어쓰지 않는다', async () => {
    const initial = deferred<PageResponse<JobPosting>>();
    const sorted = deferred<PageResponse<JobPosting>>();
    const user = userEvent.setup();
    vi.mocked(fetchJobPostings).mockReturnValueOnce(initial.promise).mockReturnValueOnce(sorted.promise);
    render(<MemoryRouter><AuthenticatedApp /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'companyName,asc');
    await act(async () => sorted.resolve(pageOf(posting({ title: '最新の並べ替え結果' }))));
    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    await act(async () => initial.resolve(pageOf(posting({ title: '遅い初期結果' }))));

    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い初期結果', level: 2 })).not.toBeInTheDocument();
  });

  test('POP 조회가 늦게 끝나도 그 뒤의 정렬 결과를 덮어쓰지 않는다', async () => {
    const history = deferred<PageResponse<JobPosting>>();
    const sorted = deferred<PageResponse<JobPosting>>();
    function HistoryControl() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>테스트 뒤로가기</button>;
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
    await user.click(screen.getByRole('button', { name: '테스트 뒤로가기' }));
    await waitFor(() => expect(fetchJobPostings).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '정렬' }), 'companyName,asc');
    await act(async () => sorted.resolve(pageOf(posting({ title: '最新の並べ替え結果' }))));
    await act(async () => history.resolve(pageOf(posting({ title: '遅い履歴結果' }))));

    expect(screen.getByRole('heading', { name: '最新の並べ替え結果', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '遅い履歴結果', level: 2 })).not.toBeInTheDocument();
  });
});
