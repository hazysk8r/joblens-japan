import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import JobPostingCreateForm from '../components/JobPostingCreateForm';
import { ApiError } from '../api/apiError';
import {
  createJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

const fields = [
  ['companyName', '회사명'],
  ['title', '공고 제목'],
  ['sourceUrl', '공고 URL'],
  ['originalText', '공고 원문'],
  ['salaryMin', '최저 월급'],
  ['salaryMax', '최고 월급'],
  ['applicationDeadline', '応募締切日'],
] as const;

const unrecognizedFieldCases: { name: string; fieldErrors: Record<string, string> }[] = [
  { name: '알 수 없는 필드만 있는 경우', fieldErrors: { serverOnly: '표시할 수 없는 필드 오류' } },
  { name: '지원 필드와 알 수 없는 필드가 섞인 경우', fieldErrors: { title: '제목을 확인해 주세요.', serverOnly: '표시할 수 없는 필드 오류' } },
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
  await user.type(screen.getByLabelText('공고 제목'), 'エンジニア');
  await user.type(screen.getByLabelText('공고 원문'), 'Java AWS');
}

async function fillAllFields(user: ReturnType<typeof userEvent.setup>) {
  await fillRequiredFields(user);
  await user.type(screen.getByLabelText('회사명'), '求人会社');
  await user.type(screen.getByLabelText('공고 URL'), 'https://example.com/job/1');
  await user.selectOptions(screen.getByLabelText('최저 월급'), '300000');
  await user.selectOptions(screen.getByLabelText('최고 월급'), '500000');
  await user.type(screen.getByLabelText('応募締切日'), '2026-12-01');
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="create-location">{location.pathname}</output>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('JobPostingCreateForm 필드 오류', () => {
  test('지원하는 일곱 필드의 메시지를 입력란과 연결하고 일반 오류도 표시한다', async () => {
    const user = userEvent.setup();
    const fieldErrors = Object.fromEntries(
      fields.map(([field]) => [field, `${field} 입력을 확인해 주세요.`]),
    );
    vi.mocked(createJobPosting).mockRejectedValueOnce(
      new ApiError('입력값 검증에 실패했습니다.', 400, 'VALIDATION_ERROR', fieldErrors),
    );
    render(<JobPostingCreateForm onCreated={vi.fn()} />);

    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('입력값 검증에 실패했습니다.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    for (const [field, label] of fields) {
      const input = screen.getByLabelText(label);
      const message = screen.getByText(fieldErrors[field]);
      expect(message).toHaveAttribute('id', `create-${field}-error`);
      expect(message).not.toHaveAttribute('role', 'alert');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', message.id);
      expect(input).toHaveAccessibleDescription(fieldErrors[field]);
    }
  });

  test.each(unrecognizedFieldCases)('$name에도 일반 오류 안내를 유지한다', async ({ fieldErrors }) => {
    const user = userEvent.setup();
    vi.mocked(createJobPosting).mockRejectedValueOnce(
      new ApiError('등록 요청을 확인해 주세요.', 400, 'VALIDATION_ERROR', fieldErrors),
    );
    render(<JobPostingCreateForm onCreated={vi.fn()} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('등록 요청을 확인해 주세요.');
    expect(screen.queryByText('표시할 수 없는 필드 오류')).not.toBeInTheDocument();
    if ('title' in fieldErrors) {
      expect(screen.getByLabelText('공고 제목')).toHaveAccessibleDescription('제목을 확인해 주세요.');
    } else {
      expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    }
  });

  test.each([
    { name: '필드 없는 API 오류', error: new ApiError('서버가 응답하지 않습니다.', 503), message: '서버가 응답하지 않습니다.' },
    { name: '네트워크 오류', error: new TypeError('Failed to fetch'), message: 'Failed to fetch' },
    { name: 'Error가 아닌 실패', error: null, message: '알 수 없는 오류가 발생했습니다.' },
  ])('$name을 일반 오류로 표시한다', async ({ error, message }) => {
    const user = userEvent.setup();
    vi.mocked(createJobPosting).mockRejectedValueOnce(error);
    render(<JobPostingCreateForm onCreated={vi.fn()} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
  });

  test('입력 수정 시 오류를 유지하고 재제출 시작 시 지운 뒤 새 실패로 교체한다', async () => {
    const user = userEvent.setup();
    const retry = deferred<JobPosting>();
    const onCreated = vi.fn();
    vi.mocked(createJobPosting)
      .mockRejectedValueOnce(new ApiError('첫 번째 검증 오류', 400, 'VALIDATION_ERROR', {
        title: '이전 제목 오류',
        salaryMin: '이전 최저 월급 오류',
      }))
      .mockReturnValueOnce(retry.promise);
    render(<JobPostingCreateForm onCreated={onCreated} />);
    await fillAllFields(user);
    await user.click(screen.getByRole('button', { name: '등록' }));
    await screen.findByText('이전 제목 오류');

    await user.clear(screen.getByLabelText('공고 제목'));
    await user.type(screen.getByLabelText('공고 제목'), '수정한 제목');
    await user.selectOptions(screen.getByLabelText('최저 월급'), '350000');
    expect(screen.getByRole('alert')).toHaveTextContent('첫 번째 검증 오류');
    expect(screen.getByLabelText('공고 제목')).toHaveAccessibleDescription('이전 제목 오류');
    expect(screen.getByLabelText('최저 월급')).toHaveAccessibleDescription('이전 최저 월급 오류');

    await user.click(screen.getByRole('button', { name: '등록' }));
    expect(screen.getByRole('button', { name: '등록 중...' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('이전 제목 오류')).not.toBeInTheDocument();
    expect(screen.queryByText('이전 최저 월급 오류')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
      expect(screen.getByLabelText(label)).toBeEnabled();
    }

    await act(async () => {
      retry.reject(new ApiError('두 번째 검증 오류', 400, 'VALIDATION_ERROR', {
        salaryMax: '새 최고 월급 오류',
      }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('두 번째 검증 오류');
    expect(screen.getByLabelText('최고 월급')).toHaveAccessibleDescription('새 최고 월급 오류');
    expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('최저 월급')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('공고 제목')).toHaveValue('수정한 제목');
    expect(screen.getByLabelText('최저 월급')).toHaveValue('350000');
    expect(screen.getByLabelText('최고 월급')).toHaveValue('500000');
    expect(screen.getByLabelText('회사명')).toHaveValue('求人会社');
    expect(screen.getByLabelText('공고 URL')).toHaveValue('https://example.com/job/1');
    expect(screen.getByLabelText('공고 원문')).toHaveValue('Java AWS');
    expect(screen.getByLabelText('応募締切日')).toHaveValue('2026-12-01');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '등록' })).toBeEnabled();
  });

  test('재제출 성공 시 오류와 입력값을 초기화하고 등록 완료를 전달한다', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createJobPosting)
      .mockRejectedValueOnce(new ApiError('입력값 오류', 400, 'VALIDATION_ERROR', {
        title: '제목 확인 필요',
      }))
      .mockResolvedValueOnce(createdPosting);
    render(<JobPostingCreateForm onCreated={onCreated} />);
    await fillAllFields(user);
    await user.click(screen.getByRole('button', { name: '등록' }));
    await screen.findByText('제목 확인 필요');
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('채용공고가 등록되었습니다.')).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('제목 확인 필요')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).toHaveValue('');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
  });
});

test('등록 페이지에서 등록 성공 후 기존 홈 경로로 이동한다', async () => {
  const user = userEvent.setup();
  const request = deferred<JobPosting>();
  vi.mocked(createJobPosting).mockReturnValueOnce(request.promise);
  vi.mocked(fetchJobPostings).mockResolvedValue({
    content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true,
  });
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
  render(
    <MemoryRouter initialEntries={['/job-postings/new']}>
      <App />
      <LocationDisplay />
    </MemoryRouter>,
  );
  await fillRequiredFields(user);
  await user.click(screen.getByRole('button', { name: '등록' }));
  expect(screen.getByTestId('create-location')).toHaveTextContent('/job-postings/new');

  await act(async () => {
    request.resolve(createdPosting);
  });

  await waitFor(() => {
    expect(screen.getByTestId('create-location').textContent).toBe('/');
  });
  expect(screen.queryByRole('heading', { name: '채용공고 등록' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '검색어' })).toBeInTheDocument();
  expect(fetchJobPostings).toHaveBeenCalled();
});
