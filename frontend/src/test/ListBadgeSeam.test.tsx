import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';

/**
 * 一覧の応答の判定がカードのバッジになるまでを、fetchだけを差し替えて検証する。
 * 応答の形はバックエンドのJobPostingListAnalysisTestと合わせる。
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const posting = {
  companyName: '東京テック',
  sourceUrl: null,
  originalText: '求人の原文',
  createdAt: '2026-10-17T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname === '/api/job-postings/status-summary') {
      return jsonResponse({ saved: 2, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    return jsonResponse({
      content: [
        { ...posting, id: 1, title: '固定残業代ありの求人', fixedOvertime: { status: 'PRESENT', hours: 45 } },
        { ...posting, id: 2, title: '分析に失敗した求人', fixedOvertime: null },
      ],
      page: 0, size: 5, totalElements: 2, totalPages: 1, first: true, last: true,
    });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('一覧の応答の判定をカードのバッジに表示し、判定のない求人には出さない', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );

  const cards = await screen.findAllByRole('listitem');
  expect(within(cards[0]).getByText('固定残業代 あり（月45時間分）')).toBeInTheDocument();
  expect(cards[1]).not.toHaveTextContent('固定残業代');
});
