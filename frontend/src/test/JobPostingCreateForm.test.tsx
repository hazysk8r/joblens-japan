import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import JobPostingCreateForm from '../components/JobPostingCreateForm';
import { ApiError } from '../api/apiError';
import {
  createJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

const fields = [
  ['companyName', '会社名'],
  ['title', '求人タイトル'],
  ['sourceUrl', '求人URL'],
  ['originalText', '求人原文'],
  ['salaryMin', '最低月給'],
  ['salaryMax', '最高月給'],
  ['applicationDeadline', '応募締切日'],
] as const;

const unrecognizedFieldCases: { name: string; fieldErrors: Record<string, string> }[] = [
  { name: '不明な項目だけがある場合', fieldErrors: { serverOnly: '表示できない項目のエラー' } },
  { name: '対応する項目と不明な項目が混在する場合', fieldErrors: { title: 'タイトルを確認してください。', serverOnly: '表示できない項目のエラー' } },
];

const createdPosting: JobPosting = {
  id: 1,
  companyName: '求人会社',
  title: 'エンジニア',
  sourceUrl: 'https://example.com/job/1',
  originalText: 'Java AWS',
  salaryMin: 300000,
  salaryMax: 500000,
  applicationDeadline: '2026-12-01',
  createdAt: '2026-10-15T00:00:00Z',
  applicationStatus: 'SAVED',
  version: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('求人タイトル'), 'エンジニア');
  await user.type(screen.getByLabelText('求人原文'), 'Java AWS');
}

async function fillAllFields(user: ReturnType<typeof userEvent.setup>) {
  await fillRequiredFields(user);
  await user.type(screen.getByLabelText('会社名'), '求人会社');
  await user.type(screen.getByLabelText('求人URL'), 'https://example.com/job/1');
  await user.selectOptions(screen.getByLabelText('最低月給'), '300000');
  await user.selectOptions(screen.getByLabelText('最高月給'), '500000');
  await user.type(screen.getByLabelText('応募締切日'), '2026-12-01');
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="create-location">{location.pathname}</output>;
}

// エラーの説明が付いていないこと。原文の欄には文字数の説明が常に付く。
function expectNoErrorDescription(input: HTMLElement) {
  expect(input.getAttribute('aria-describedby') ?? '').not.toContain('-error');
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('JobPostingCreateFormの項目エラー', () => {
  test('対応する7項目のメッセージを入力欄と関連付け、全体のエラーも表示する', async () => {
    const user = userEvent.setup();
    const fieldErrors = Object.fromEntries(
      fields.map(([field]) => [field, `${field} の入力を確認してください。`]),
    );
    vi.mocked(createJobPosting).mockRejectedValueOnce(
      new ApiError('入力値の検証に失敗しました。', 400, 'VALIDATION_ERROR', fieldErrors),
    );
    render(<JobPostingCreateForm draftKey="test-posting-draft" onCreated={vi.fn()} />);

    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expectNoErrorDescription(screen.getByLabelText(label));
    }

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('入力値の検証に失敗しました。');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    for (const [field, label] of fields) {
      const input = screen.getByLabelText(label);
      const message = screen.getByText(fieldErrors[field]);
      expect(message).toHaveAttribute('id', `create-${field}-error`);
      expect(message).not.toHaveAttribute('role', 'alert');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
      // 原文の欄は、エラーに続けて文字数も説明として読み上げる。
      if (field !== 'originalText') {
        expect(input).toHaveAccessibleDescription(fieldErrors[field]);
      }
    }
  });

  test.each(unrecognizedFieldCases)('$nameでも全体のエラー案内を維持する', async ({ fieldErrors }) => {
    const user = userEvent.setup();
    vi.mocked(createJobPosting).mockRejectedValueOnce(
      new ApiError('登録リクエストを確認してください。', 400, 'VALIDATION_ERROR', fieldErrors),
    );
    render(<JobPostingCreateForm draftKey="test-posting-draft" onCreated={vi.fn()} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登録リクエストを確認してください。');
    expect(screen.queryByText('表示できない項目のエラー')).not.toBeInTheDocument();
    if ('title' in fieldErrors) {
      expect(screen.getByLabelText('求人タイトル')).toHaveAccessibleDescription('タイトルを確認してください。');
    } else {
      expect(screen.getByLabelText('求人タイトル')).not.toHaveAttribute('aria-invalid');
    }
  });

  test.each([
    { name: '項目のないAPIエラー', error: new ApiError('サーバーが応答しません。', 503), message: 'サーバーが応答しません。' },
    { name: 'ネットワークエラー', error: new TypeError('Failed to fetch'), message: /^不明なエラーが発生しました。$/ },
    { name: 'Errorではない失敗', error: null, message: '不明なエラーが発生しました。' },
  ])('$nameを全体のエラーとして表示する', async ({ error, message }) => {
    const user = userEvent.setup();
    vi.mocked(createJobPosting).mockRejectedValueOnce(error);
    render(<JobPostingCreateForm draftKey="test-posting-draft" onCreated={vi.fn()} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expectNoErrorDescription(screen.getByLabelText(label));
    }
  });

  test('入力の編集中はエラーを維持し、再送信の開始時に消してから新しい失敗に置き換える', async () => {
    const user = userEvent.setup();
    const retry = deferred<JobPosting>();
    const onCreated = vi.fn();
    vi.mocked(createJobPosting)
      .mockRejectedValueOnce(new ApiError('1回目の検証エラー', 400, 'VALIDATION_ERROR', {
        title: '以前のタイトルのエラー',
        salaryMin: '以前の最低月給のエラー',
      }))
      .mockReturnValueOnce(retry.promise);
    render(<JobPostingCreateForm draftKey="test-posting-draft" onCreated={onCreated} />);
    await fillAllFields(user);
    await user.click(screen.getByRole('button', { name: '登録' }));
    await screen.findByText('以前のタイトルのエラー');

    await user.clear(screen.getByLabelText('求人タイトル'));
    await user.type(screen.getByLabelText('求人タイトル'), '編集したタイトル');
    await user.selectOptions(screen.getByLabelText('最低月給'), '350000');
    expect(screen.getByRole('alert')).toHaveTextContent('1回目の検証エラー');
    expect(screen.getByLabelText('求人タイトル')).toHaveAccessibleDescription('以前のタイトルのエラー');
    expect(screen.getByLabelText('最低月給')).toHaveAccessibleDescription('以前の最低月給のエラー');

    await user.click(screen.getByRole('button', { name: '登録' }));
    expect(screen.getByRole('button', { name: '登録中…' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('以前のタイトルのエラー')).not.toBeInTheDocument();
    expect(screen.queryByText('以前の最低月給のエラー')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expectNoErrorDescription(screen.getByLabelText(label));
      expect(screen.getByLabelText(label)).toBeEnabled();
    }

    await act(async () => {
      retry.reject(new ApiError('2回目の検証エラー', 400, 'VALIDATION_ERROR', {
        salaryMax: '新しい最高月給のエラー',
      }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('2回目の検証エラー');
    expect(screen.getByLabelText('最高月給')).toHaveAccessibleDescription('新しい最高月給のエラー');
    expect(screen.getByLabelText('求人タイトル')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('最低月給')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('求人タイトル')).toHaveValue('編集したタイトル');
    expect(screen.getByLabelText('最低月給')).toHaveValue('350000');
    expect(screen.getByLabelText('最高月給')).toHaveValue('500000');
    expect(screen.getByLabelText('会社名')).toHaveValue('求人会社');
    expect(screen.getByLabelText('求人URL')).toHaveValue('https://example.com/job/1');
    expect(screen.getByLabelText('求人原文')).toHaveValue('Java AWS');
    expect(screen.getByLabelText('応募締切日')).toHaveValue('2026-12-01');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '登録' })).toBeEnabled();
  });

  test('再送信の成功時にエラーと入力値を初期化し、登録した求人を渡す', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createJobPosting)
      .mockRejectedValueOnce(new ApiError('入力値のエラー', 400, 'VALIDATION_ERROR', {
        title: 'タイトルの確認が必要',
      }))
      .mockResolvedValueOnce(createdPosting);
    render(<JobPostingCreateForm draftKey="test-posting-draft" onCreated={onCreated} />);
    await fillAllFields(user);
    await user.click(screen.getByRole('button', { name: '登録' }));
    await screen.findByText('タイトルの確認が必要');
    await user.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(createdPosting);
    // 登録の知らせは移った先の画面で出すため、フォームには出さない。
    expect(screen.queryByText('求人を登録しました。')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('タイトルの確認が必要')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).toHaveValue('');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expectNoErrorDescription(screen.getByLabelText(label));
    }
  });
});

test('登録ページでは登録が終わるまで留まり、終わったら登録した求人の詳細画面へ移る', async () => {
  const user = userEvent.setup();
  const request = deferred<JobPosting>();
  vi.mocked(createJobPosting).mockReturnValueOnce(request.promise);
  // 移った先の詳細画面の取得は、この検証では待たない。
  vi.mocked(fetchJobPosting).mockReturnValue(new Promise(() => {}));
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true,
  });
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  render(
    <MemoryRouter initialEntries={['/job-postings/new']}>
      <AuthenticatedApp />
      <LocationDisplay />
    </MemoryRouter>,
  );
  await fillRequiredFields(user);
  await user.click(screen.getByRole('button', { name: '登録' }));
  expect(screen.getByTestId('create-location')).toHaveTextContent('/job-postings/new');

  await act(async () => {
    request.resolve(createdPosting);
  });

  await waitFor(() => {
    expect(screen.getByTestId('create-location').textContent).toBe(`/job-postings/${createdPosting.id}`);
  });
  expect(screen.queryByRole('heading', { name: '求人登録' })).not.toBeInTheDocument();
  expect(fetchJobPosting).toHaveBeenCalledWith(createdPosting.id, expect.any(AbortSignal));
});
