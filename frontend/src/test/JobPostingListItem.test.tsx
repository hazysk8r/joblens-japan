import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, vi, test, expect, describe } from 'vitest';

import '@testing-library/jest-dom/vitest';

import { fetchApplicationStatusHistory } from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting } from '../types/jobPosting';
import JobPostingListItem from '../components/JobPostingListItem';

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');

// 求人のタイトルが詳細画面へのリンクのため、Routerの中で表示する。
function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: MemoryRouter });
}

vi.mock('../api/jobPostingMemoApi')

describe('求人原文のリンク', () => {
  const renderWithSourceUrl = async (sourceUrl: string | null) => {
    const jobPosting: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl,
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    render(
      <JobPostingListItem
        jobPosting={jobPosting}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await screen.findByRole('heading', { level: 2, name: 'エンジニア求人' });
  };

  test('httpとhttpsのURLは新しいタブで開くリンクとして表示する', async () => {
    await renderWithSourceUrl('https://example.com/jobs/1');

    const link = screen.getByRole('link', { name: '原文を見る' });
    expect(link).toHaveAttribute('href', 'https://example.com/jobs/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  // 検証を導入する前に保存された値が、DBに残っている場合。
  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'www.example.com',
    'ftp://example.com/x',
  ])('保存された値が%sならリンクを表示しない', async (sourceUrl) => {
    await renderWithSourceUrl(sourceUrl);

    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
    expect(screen.getByText('AWSエンジニア求人')).toBeInTheDocument();
  });

  test('URLがなければリンクを表示しない', async () => {
    await renderWithSourceUrl(null);

    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
  });
});

describe('詳細画面へのリンク', () => {
  test('タイトルが詳細画面へのリンクになる', () => {
    const jobPosting: JobPosting = {
      id: 42,
      companyName: '○○株式会社',
      title: 'バックエンドエンジニア',
      sourceUrl: null,
      originalText: '原文',
      createdAt: '2026-11-08T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    render(
      <JobPostingListItem
        jobPosting={jobPosting}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'バックエンドエンジニア' }))
      .toHaveAttribute('href', '/job-postings/42');
    expect(screen.getByRole('heading', { level: 2, name: 'バックエンドエンジニア' }))
      .toBeInTheDocument();
  });
});

describe('応募ステータスとメモ', () => {
  const jobPosting: JobPosting = {
    id: 42,
    companyName: '○○株式会社',
    title: 'バックエンドエンジニア',
    sourceUrl: null,
    originalText: '原文',
    createdAt: '2026-11-08T00:00:00Z',
    applicationStatus: 'INTERVIEWING',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };

  // 変更やメモの操作は詳細画面で行う。
  test('応募ステータスは文字だけで表示し、メモと変更履歴の操作も通信もしない', () => {
    render(
      <JobPostingListItem
        jobPosting={jobPosting}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('応募ステータス: 面接中')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'メモを見る' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '変更履歴を表示' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('メモ内容')).not.toBeInTheDocument();
    expect(getJobPostingMemos).not.toHaveBeenCalled();
    expect(fetchApplicationStatusHistory).not.toHaveBeenCalled();
  });
});
