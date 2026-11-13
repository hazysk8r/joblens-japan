import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import {
  createJobPosting,
  fetchApplicationStatusHistory,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  updateJobPosting,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting } from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

// AuthenticatedAppのログイン中のユーザーは1。
const CREATE_DRAFT_KEY = 'joblens.posting-draft.1';
const EDIT_DRAFT_KEY = 'joblens.posting-edit-draft.1.5';
const TOO_LONG = '求人原文は20000文字以内で入力してください。';

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  vi.mocked(fetchJobPostingAnalysis).mockResolvedValue({
    fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
    skills: [],
  });
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const textArea = () => screen.getByLabelText('求人原文') as HTMLTextAreaElement;
const counterOf = (field: HTMLElement) => {
  const ids = (field.getAttribute('aria-describedby') ?? '').split(' ');
  return ids.map((id) => document.getElementById(id))
    .find((element) => element?.classList.contains('original-text-length')) ?? null;
};
const setText = (text: string) => fireEvent.change(textArea(), { target: { value: text } });

async function openCreateForm() {
  const user = renderAt('/job-postings/new');
  await screen.findByLabelText('求人原文');
  return user;
}

async function openEditForm() {
  const user = renderAt('/job-postings/5');
  await user.click(await screen.findByRole('button', { name: '編集' }));
  return user;
}

describe.each([
  ['登録', openCreateForm],
  ['編集', openEditForm],
])('%sフォームの原文の文字数', (_, open) => {
  test('前後の空白を除いた文字数を、上限と一緒に入力欄の説明として示す', async () => {
    await open();

    setText(`  ${'あ'.repeat(12345)}\n`);

    const counter = counterOf(textArea());
    expect(counter).not.toBeNull();
    expect(counter).toHaveTextContent(/^12,345 \/ 20,000文字$/);
    expect(counter).not.toHaveClass('original-text-length--over');
  });

  test('ちょうど上限なら超えていると言わない', async () => {
    await open();

    setText('あ'.repeat(20000));

    expect(counterOf(textArea())).toHaveTextContent(/^20,000 \/ 20,000文字$/);
    expect(counterOf(textArea())).not.toHaveClass('original-text-length--over');
  });

  test('上限を超えたら、超えた文字数と減らし方を伝える', async () => {
    await open();

    setText('あ'.repeat(23210));

    const counter = counterOf(textArea());
    expect(counter).toHaveClass('original-text-length--over');
    expect(counter).toHaveTextContent('23,210 / 20,000文字');
    expect(counter).toHaveTextContent(
      '20,000文字を3,210文字超えています。求人サイトのページの下にある、ほかの求人などを除いてください。',
    );
  });
});

describe('上限を超えたまま送ったとき', () => {
  test('登録では送らずに項目のエラーを示し、入力を残して原文の欄へ移る', async () => {
    const user = await openCreateForm();
    await user.type(screen.getByLabelText('求人タイトル'), 'タイトル');
    setText('あ'.repeat(20001));

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(createJobPosting).not.toHaveBeenCalled();
    expect(screen.getByText(TOO_LONG)).toBeInTheDocument();
    expect(textArea()).toHaveAttribute('aria-invalid', 'true');
    expect(textArea().value).toHaveLength(20001);
    expect(textArea()).toHaveFocus();
  });

  test('編集では保存せずに項目のエラーを示し、入力を残して原文の欄へ移る', async () => {
    const user = await openEditForm();
    setText('あ'.repeat(20001));

    await user.click(screen.getByRole('button', { name: /^保存/ }));

    expect(updateJobPosting).not.toHaveBeenCalled();
    expect(screen.getByText(TOO_LONG)).toBeInTheDocument();
    expect(textArea()).toHaveAttribute('aria-invalid', 'true');
    expect(textArea().value).toHaveLength(20001);
    expect(textArea()).toHaveFocus();
  });
});

describe('ちょうど上限で送ったとき', () => {
  test('登録では送る', async () => {
    vi.mocked(createJobPosting).mockReturnValue(new Promise(() => {}));
    const user = await openCreateForm();
    await user.type(screen.getByLabelText('求人タイトル'), 'タイトル');
    setText('あ'.repeat(20000));

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(createJobPosting).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
  });

  test('編集では保存する', async () => {
    vi.mocked(updateJobPosting).mockReturnValue(new Promise(() => {}));
    const user = await openEditForm();
    setText('あ'.repeat(20000));

    await user.click(screen.getByRole('button', { name: /^保存/ }));

    expect(updateJobPosting).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
  });
});

describe('一時保存から戻すとき', () => {
  test('登録の一時保存は、上限を超えた原文も切り詰めずに戻す', async () => {
    sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({
      companyName: '', title: 'タイトル', sourceUrl: '', originalText: 'う'.repeat(20001),
      salaryMin: null, salaryMax: null, applicationDeadline: '',
    }));

    await openCreateForm();

    expect(textArea().value).toHaveLength(20001);
    expect(counterOf(textArea())).toHaveClass('original-text-length--over');
  });

  test('編集の一時保存は、上限を超えた原文も切り詰めずに戻す', async () => {
    sessionStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify({
      baseVersion: 3,
      values: {
        companyName: '○○株式会社', title: 'バックエンドエンジニア', sourceUrl: '',
        originalText: 'う'.repeat(20001), salaryMin: null, salaryMax: null, applicationDeadline: '',
      },
    }));
    const user = renderAt('/job-postings/5');

    await user.click(await screen.findByRole('button', { name: '編集を再開' }));

    expect(textArea().value).toHaveLength(20001);
    expect(counterOf(textArea())).toHaveClass('original-text-length--over');
  });
});
