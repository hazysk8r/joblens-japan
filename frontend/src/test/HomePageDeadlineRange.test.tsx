import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import type { JobPosting } from '../types/jobPosting';

/**
 * 実際のHomePageと実際のAPIモジュールを組み合わせ、fetchだけを差し替えて検証する。
 *
 * 「リクエストを送らない」ことが要件のため、APIモジュールをmockせず、
 * 実際に送られるURLで確認する。
 */

const RANGE_ERROR = '締切日（以降）を締切日（以前）より後の日付にすることはできません。';

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function listRequests(): URL[] {
  return vi.mocked(fetch).mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((url) => url.pathname === '/api/job-postings');
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

async function renderHome() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/?keyword=Java']}>
      <AuthenticatedApp />
      <LocationProbe />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: posting.title, level: 2 });
  await user.click(screen.getByRole('button', { name: '＋ 詳細条件' }));
  return user;
}

function setDeadlines(from: string, to: string) {
  fireEvent.change(screen.getByLabelText('締切日（以降）'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('締切日（以前）'), { target: { value: to } });
}

function clickSearch(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: '検索' }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const { pathname } = new URL(input, 'http://localhost');
    if (pathname === '/api/job-postings/status-summary') {
      return jsonResponse({ saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    return jsonResponse({
      content: [posting],
      page: 0,
      size: 5,
      totalElements: 1,
      totalPages: 1,
      first: true,
      last: true,
    });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('検索の締切日範囲', () => {
  test('範囲が逆なら、リクエストを送らず一覧とURLを維持してエラーを表示する', async () => {
    const user = await renderHome();
    const requestsBefore = listRequests().length;
    const searchBefore = screen.getByTestId('location-search').textContent;

    setDeadlines('2027-01-31', '2027-01-01');
    await clickSearch(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(RANGE_ERROR);
    expect(listRequests()).toHaveLength(requestsBefore);
    expect(screen.getByRole('heading', { name: posting.title, level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toBe(searchBefore);

    const deadlineTo = screen.getByLabelText('締切日（以前）');
    expect(deadlineTo).toHaveAttribute('aria-invalid', 'true');
    expect(deadlineTo).toHaveAttribute('aria-describedby', alert.id);
  });

  test('エラー中に並び替えても、適用済みの条件で検索し不正な日付を送らない', async () => {
    const user = await renderHome();
    setDeadlines('2027-01-31', '2027-01-01');
    await clickSearch(user);
    await screen.findByRole('alert');

    await user.selectOptions(screen.getByRole('combobox', { name: '並び替え' }), 'companyName,asc');

    await waitFor(() => {
      expect(listRequests().at(-1)?.searchParams.get('sort')).toBe('companyName,asc');
    });
    const lastRequest = listRequests().at(-1);
    expect(lastRequest?.searchParams.get('keyword')).toBe('Java');
    expect(lastRequest?.searchParams.has('deadlineFrom')).toBe(false);
    expect(lastRequest?.searchParams.has('deadlineTo')).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(RANGE_ERROR);
  });

  test('詳細条件を閉じたまま検索しても、パネルを開いてエラーを見せる', async () => {
    const user = await renderHome();
    setDeadlines('2027-01-31', '2027-01-01');
    await user.click(screen.getByRole('button', { name: '－ 詳細条件を閉じる' }));
    expect(screen.queryByLabelText('締切日（以前）')).not.toBeInTheDocument();

    await clickSearch(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(RANGE_ERROR);
    expect(screen.getByLabelText('締切日（以前）')).toBeVisible();
    expect(screen.getByRole('button', { name: '－ 詳細条件を閉じる' })).toHaveAttribute('aria-expanded', 'true');
  });

  test.each([
    ['締切日（以降）', '2026-12-01'],
    ['締切日（以前）', '2027-02-28'],
  ])('%sを変更するとエラーが消え、再検索するとリクエストを送る', async (label, value) => {
    const user = await renderHome();
    setDeadlines('2027-01-31', '2027-01-01');
    await clickSearch(user);
    await screen.findByRole('alert');
    const requestsBefore = listRequests().length;

    fireEvent.change(screen.getByLabelText(label), { target: { value } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('締切日（以前）')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('締切日（以前）')).not.toHaveAttribute('aria-describedby');

    await clickSearch(user);

    await waitFor(() => expect(listRequests()).toHaveLength(requestsBefore + 1));
    expect(listRequests().at(-1)?.searchParams.has('deadlineFrom')).toBe(true);
  });

  test.each([
    ['同じ日付', '2027-01-01', '2027-01-01'],
    ['以降だけ', '2027-01-01', ''],
    ['以前だけ', '', '2027-01-01'],
    ['正しい順序', '2027-01-01', '2027-01-31'],
  ])('%sなら検索する', async (_name, from, to) => {
    const user = await renderHome();
    const requestsBefore = listRequests().length;
    setDeadlines(from, to);

    await clickSearch(user);

    await waitFor(() => expect(listRequests()).toHaveLength(requestsBefore + 1));
    const params = listRequests().at(-1)?.searchParams;
    expect(params?.get('deadlineFrom')).toBe(from || null);
    expect(params?.get('deadlineTo')).toBe(to || null);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
