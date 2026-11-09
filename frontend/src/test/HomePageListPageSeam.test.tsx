import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';

/**
 * 実際のHomePageと実際のAPIモジュールを組み合わせ、fetchだけを差し替えて検証する。
 * URLのpageが実際のリクエストになり、範囲外の応答から補正されるまでを一続きで確かめる。
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestedPages(): (string | null)[] {
  return vi.mocked(fetch).mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((url) => url.pathname === '/api/job-postings')
    .map((url) => url.searchParams.get('page'));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname === '/api/job-postings/status-summary') {
      return jsonResponse({ saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }

    const page = Number(url.searchParams.get('page'));
    return jsonResponse({
      content: page < 2
        ? [{
            id: 1,
            companyName: '東京テック',
            title: '最後のページの求人',
            sourceUrl: null,
            originalText: '求人の原文',
            createdAt: '2026-10-17T00:00:00Z',
            applicationStatus: 'SAVED',
            salaryMin: null,
            salaryMax: null,
            applicationDeadline: null,
            version: 0,
          }]
        : [],
      page,
      size: 5,
      totalElements: 6,
      totalPages: 2,
      first: page === 0,
      last: page >= 1,
    });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('URLのページが範囲外のときのリクエスト', () => {
  test('範囲外のページの次に最後の有効なページを要求して表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/?page=99']}>
        <AuthenticatedApp />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: '最後のページの求人', level: 2 }),
    ).toBeInTheDocument();
    expect(requestedPages()).toEqual(['99', '1']);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
