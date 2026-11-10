import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { CsrfTokenUnavailableError } from '../api/apiClient';
import { ApiError, userMessageOf } from '../api/apiError';
import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

// ブラウザが出す英語の文言。応答の本文を含むこともあるため、画面には出さない。
const NETWORK_ERROR = new TypeError('Failed to fetch');

const posting: JobPosting = {
  id: 1,
  companyName: '東京テック',
  title: 'Java求人',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-10-17T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

const page: PageResponse<JobPosting> = {
  content: [posting], page: 0, size: 5, totalElements: 1, totalPages: 1, first: true, last: true,
};

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>テスト用の戻る</button>;
}

function renderHome(initialEntries: string[] = ['/']) {
  render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <AuthenticatedApp />
      <BackButton />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchJobPostings).mockResolvedValue(page);
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('userMessageOf', () => {
  test('サーバーのメッセージはそのまま使う', () => {
    expect(userMessageOf(new ApiError('サーバーのメッセージ', 500), '既定')).toBe('サーバーのメッセージ');
  });

  test('CSRFトークンを取得できなかったときの案内はそのまま使う', () => {
    expect(userMessageOf(new CsrfTokenUnavailableError(), '既定'))
      .toBe('サーバーに接続できませんでした。しばらくしてから再度お試しください。');
  });

  test.each([
    ['通信エラー', NETWORK_ERROR],
    ['JSONの解析エラー', new SyntaxError('Unexpected token < in JSON')],
    ['Errorでない値', 'unknown'],
  ])('%sは既定のメッセージにする', (_, error) => {
    expect(userMessageOf(error, '既定')).toBe('既定');
  });
});

describe('一覧画面のエラー表示', () => {
  test('一覧の取得の通信エラーは既定のメッセージにする', async () => {
    vi.mocked(fetchJobPostings).mockRejectedValue(NETWORK_ERROR);
    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent(/^求人の読み込み中に不明なエラーが発生しました。$/);
  });

  test('戻る操作での取得の通信エラーは既定のメッセージにする', async () => {
    const user = renderHome(['/?keyword=Earlier', '/?keyword=Java']);
    await screen.findByRole('heading', { name: posting.title, level: 2 });
    vi.mocked(fetchJobPostings).mockRejectedValue(NETWORK_ERROR);

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^求人の読み込み中に不明なエラーが発生しました。$/);
  });

  test('戻る操作での取得でも、サーバーのメッセージは表示する', async () => {
    const user = renderHome(['/?keyword=Earlier', '/?keyword=Java']);
    await screen.findByRole('heading', { name: posting.title, level: 2 });
    vi.mocked(fetchJobPostings).mockRejectedValue(new ApiError('サーバーのメッセージ', 500));

    await user.click(screen.getByRole('button', { name: 'テスト用の戻る' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('サーバーのメッセージ');
  });

  test('応募状況の取得の通信エラーは既定のメッセージにする', async () => {
    vi.mocked(fetchApplicationStatusSummary).mockRejectedValue(NETWORK_ERROR);
    renderHome();

    const region = await screen.findByRole('region', { name: '応募状況' });
    expect(await within(region).findByRole('alert')).toHaveTextContent('応募状況の取得に失敗しました。');
    expect(region).not.toHaveTextContent('Failed to fetch');
  });

});
