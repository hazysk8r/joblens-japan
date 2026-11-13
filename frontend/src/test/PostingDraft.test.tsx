import { useState } from 'react';
import { flushSync } from 'react-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  createJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPosting,
  fetchJobPostings,
} from '../api/jobPostingApi';
import JobPostingCreateForm from '../components/JobPostingCreateForm';

vi.mock('../api/jobPostingApi');

const KEY = 'joblens.posting-draft.1';
const RESTORED = '前回入力した内容を復元しました。';

const fullDraft = {
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: 'https://example.com/jobs/1',
  originalText: '【給与】\n月給30万円',
  salaryMin: 300000 as number | null,
  salaryMax: 500000 as number | null,
  applicationDeadline: '2026-12-01',
};

const emptyDraft: typeof fullDraft = {
  companyName: '',
  title: '',
  sourceUrl: '',
  originalText: '',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: '',
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/job-postings/new']}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const stored = () => JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as typeof fullDraft | null;

function expectFormValues(draft: typeof fullDraft) {
  expect(field('会社名')).toHaveValue(draft.companyName);
  expect(field('求人タイトル')).toHaveValue(draft.title);
  expect(field('求人URL')).toHaveValue(draft.sourceUrl);
  expect(field('求人原文')).toHaveValue(draft.originalText);
  expect(field('最低月給')).toHaveValue(draft.salaryMin === null ? '' : String(draft.salaryMin));
  expect(field('最高月給')).toHaveValue(draft.salaryMax === null ? '' : String(draft.salaryMax));
  expect(field('応募締切日')).toHaveValue(draft.applicationDeadline);
}

const created = {
  ...fullDraft,
  id: 1,
  createdAt: '2026-11-10T00:00:00Z',
  applicationStatus: 'SAVED' as const,
  version: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
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

describe('求人登録の入力の一時保存', () => {
  test('入力したすべての項目を保存し、開き直すと復元して知らせる', async () => {
    const user = renderPage();
    await user.type(field('会社名'), fullDraft.companyName);
    await user.type(field('求人タイトル'), fullDraft.title);
    await user.type(field('求人URL'), fullDraft.sourceUrl);
    await user.type(field('求人原文'), fullDraft.originalText);
    await user.selectOptions(field('最低月給'), '300000');
    await user.selectOptions(field('最高月給'), '500000');
    await user.type(field('応募締切日'), fullDraft.applicationDeadline);
    expect(screen.queryByText(RESTORED)).not.toBeInTheDocument();
    expect(stored()).toEqual(fullDraft);

    cleanup();
    renderPage();

    expectFormValues(fullDraft);
    expect(screen.getByRole('status')).toHaveTextContent(RESTORED);
    expect(screen.getByRole('button', { name: '入力を消去' })).toBeInTheDocument();
  });

  test('保存された内容がなければ、復元の案内も消去のボタンも出さない', () => {
    renderPage();

    expectFormValues(emptyDraft);
    expect(screen.queryByText(RESTORED)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を消去' })).not.toBeInTheDocument();
  });

  test('入力を消去すると、すべての項目と一時保存と案内を消す', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(fullDraft));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: '入力を消去' }));

    expectFormValues(emptyDraft);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(RESTORED)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を消去' })).not.toBeInTheDocument();
  });

  // 押したボタンが消えると、キーボードのフォーカスがページの先頭へ外れてしまう。
  test('入力を消去すると、最初の入力欄へフォーカスを移す', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(fullDraft));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: '入力を消去' }));

    expect(field('会社名')).toHaveFocus();
  });

  test('すべての項目を空にすると一時保存を消す', async () => {
    const user = renderPage();
    await user.type(field('求人タイトル'), 'あ');
    expect(stored()?.title).toBe('あ');

    await user.clear(field('求人タイトル'));

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  test('登録に成功したら一時保存を消して、登録した求人の詳細画面へ移動する', async () => {
    sessionStorage.setItem(KEY, JSON.stringify(fullDraft));
    vi.mocked(createJobPosting).mockResolvedValue(created);
    // 移った先の詳細画面の取得は、この検証では待たない。
    vi.mocked(fetchJobPosting).mockReturnValue(new Promise(() => {}));
    const user = renderPage();

    await user.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: '求人登録' })).not.toBeInTheDocument());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  // 画面を移動しない親でも、成功したら残さない。
  test('登録に成功したら、フォームが表示されたままでも一時保存と案内を消す', async () => {
    sessionStorage.setItem('k', JSON.stringify(fullDraft));
    vi.mocked(createJobPosting).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<JobPostingCreateForm draftKey="k" onCreated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => expect(createJobPosting).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sessionStorage.getItem('k')).toBeNull());
    expect(screen.queryByText(RESTORED)).not.toBeInTheDocument();
  });

  // 成功の直後にフォームが画面から消えると、入力の変化を保存する処理は実行されない。
  test('登録に成功した直後にフォームが消えても、一時保存を残さない', async () => {
    function Parent() {
      const [done, setDone] = useState(false);
      return done
        ? <p>完了</p>
        : <JobPostingCreateForm draftKey="k" onCreated={() => flushSync(() => setDone(true))} />;
    }
    sessionStorage.setItem('k', JSON.stringify(fullDraft));
    vi.mocked(createJobPosting).mockResolvedValue(created);
    const user = userEvent.setup();
    render(<Parent />);

    await user.click(screen.getByRole('button', { name: '登録' }));

    await screen.findByText('完了');
    expect(sessionStorage.getItem('k')).toBeNull();
  });

  test('求人原文だけを入力しても保存する', async () => {
    const user = renderPage();

    await user.type(field('求人原文'), '原文だけ');

    expect(stored()).toEqual({ ...emptyDraft, originalText: '原文だけ' });
  });

  test('登録に失敗したら入力と一時保存を残す', async () => {
    vi.mocked(createJobPosting).mockRejectedValue(new ApiError('登録できる求人は100件までです。', 409));
    const user = renderPage();
    await user.type(field('求人タイトル'), 'タイトル');
    await user.type(field('求人原文'), '原文');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登録できる求人は100件までです。');
    expect(stored()).toEqual({ ...emptyDraft, title: 'タイトル', originalText: '原文' });
  });

  test('別のユーザーの一時保存は読まない', () => {
    sessionStorage.setItem('joblens.posting-draft.2', JSON.stringify(fullDraft));

    renderPage();

    expectFormValues(emptyDraft);
  });

  test.each([
    ['JSONでない', '{broken'],
    ['オブジェクトでない', '"text"'],
    ['null', 'null'],
    ['配列', '[]'],
    ['会社名が文字列でない', JSON.stringify({ ...fullDraft, companyName: 5 })],
    ['求人タイトルが文字列でない', JSON.stringify({ ...fullDraft, title: 5 })],
    ['求人URLが文字列でない', JSON.stringify({ ...fullDraft, sourceUrl: 5 })],
    ['求人原文が文字列でない', JSON.stringify({ ...fullDraft, originalText: 5 })],
    ['項目が足りない', JSON.stringify({ title: 'あ' })],
  ])('保存された値が%sなら、すべて無視する', (_, value) => {
    sessionStorage.setItem(KEY, value);

    renderPage();

    expectFormValues(emptyDraft);
    expect(screen.queryByText(RESTORED)).not.toBeInTheDocument();
  });

  // 切り詰めた原文がそのまま登録されると、末尾の欠けに気付けないため。超えていることは文字数の表示で伝える。
  test('長すぎる値も切り詰めずに戻す', () => {
    sessionStorage.setItem(KEY, JSON.stringify({
      ...fullDraft,
      companyName: 'あ'.repeat(201),
      title: 'い'.repeat(201),
      sourceUrl: 'u'.repeat(2049),
      originalText: 'う'.repeat(20001),
    }));

    renderPage();

    expect(field('会社名').value).toHaveLength(201);
    expect(field('求人タイトル').value).toHaveLength(201);
    expect(field('求人URL').value).toHaveLength(2049);
    expect(field('求人原文').value).toHaveLength(20001);
  });

  test.each([
    ['選択肢にない数', 123456],
    ['文字列', '300000'],
  ])('給与が%sなら指定なしにする', (_, salary) => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...fullDraft, salaryMin: salary, salaryMax: salary }));

    renderPage();

    expectFormValues({ ...fullDraft, salaryMin: null, salaryMax: null });
    // 選択欄は選択肢にない値を空として表示するため、保持している値(保存し直された内容)も確かめる。
    expect(stored()).toEqual({ ...fullDraft, salaryMin: null, salaryMax: null });
  });

  test.each([
    ['形式の違う文字列', '2026/12/01'],
    ['余分な文字のある日付', '2026-12-01T00:00'],
    ['数', 20261201],
    ['日付の文字列を入れた配列', ['2026-12-01']],
  ])('締切日が%sなら空にする', (_, deadline) => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...fullDraft, applicationDeadline: deadline }));

    renderPage();

    expectFormValues({ ...fullDraft, applicationDeadline: '' });
    // 日付の入力欄は形式の違う値を空として表示するため、保持している値(保存し直された内容)も確かめる。
    expect(stored()).toEqual({ ...fullDraft, applicationDeadline: '' });
  });

  test('ストレージを使えなくても入力して登録できる', async () => {
    const unavailable = () => {
      throw new DOMException('使用できません', 'QuotaExceededError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(unavailable);
    vi.mocked(createJobPosting).mockRejectedValue(new ApiError('失敗', 500));
    const user = renderPage();

    await user.type(field('求人タイトル'), 'タイトル');
    await user.type(field('求人原文'), '原文');
    await user.clear(field('求人タイトル'));
    await user.type(field('求人タイトル'), '別のタイトル');
    await user.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => expect(createJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({ title: '別のタイトル', originalText: '原文' }),
    ));
  });
});

describe('求人登録のエラー表示', () => {
  test('通信エラーの英語の文言は表示しない', async () => {
    vi.mocked(createJobPosting).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = renderPage();
    await user.type(field('求人タイトル'), 'タイトル');
    await user.type(field('求人原文'), '原文');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^不明なエラーが発生しました。$/);
  });
});
