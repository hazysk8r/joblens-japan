import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';
import JobPostingListItem from '../components/JobPostingListItem';
import type { ListedJobPosting } from '../types/jobPosting';

const listed = (excerpt: string): ListedJobPosting => ({
  id: 1,
  companyName: 'A社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  excerpt,
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
  fixedOvertime: null,
});

const excerptElement = () => document.querySelector('.job-posting-card__excerpt') as HTMLElement;
const marks = () => Array.from(excerptElement().querySelectorAll('mark')).map((mark) => mark.textContent);

function renderCard(excerpt: string, keyword?: string) {
  render(
    <MemoryRouter>
      <JobPostingListItem jobPosting={listed(excerpt)} keyword={keyword} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('一覧のカードの要約', () => {
  test('サーバーが作った要約をそのまま表示する', () => {
    renderCard('…開発環境：AWS、Kubernetes、Terraform…');

    expect(excerptElement()).toHaveTextContent(/^…開発環境：AWS、Kubernetes、Terraform…$/);
    expect(marks()).toEqual([]);
  });

  test('検索語を大文字と小文字を区別せずに強調し、文字は変えない', () => {
    renderCard('…開発環境：AWS、Kubernetes。aws認定資格があれば尚可…', 'aws');

    expect(marks()).toEqual(['AWS', 'aws']);
    expect(excerptElement().textContent).toBe('…開発環境：AWS、Kubernetes。aws認定資格があれば尚可…');
  });

  test('要約に検索語がなければ強調しない', () => {
    // タイトルや会社名で見つかった求人では、要約は原文の先頭になる。
    renderCard('【業務内容】バックエンド開発', '株式会社');

    expect(marks()).toEqual([]);
    expect(excerptElement().textContent).toBe('【業務内容】バックエンド開発');
  });

  test('検索語がないときと空白だけのときは強調しない', () => {
    renderCard('AWSの開発', '   ');

    expect(marks()).toEqual([]);
  });

  test('前後の空白を除いた検索語で強調し、重ならないように前から順に強調する', () => {
    renderCard('ああああ', ' ああ ');

    expect(marks()).toEqual(['ああ', 'ああ']);
  });

  test('検索語の続く空白や全角空白は、サーバーと同じく1つの空白にまとめて探す', () => {
    renderCard('…開発環境 AWS、Kubernetes…', '開発環境　　AWS');

    expect(marks()).toEqual(['開発環境 AWS']);
  });

  test('絵文字を含む要約でも文字を途中で切らずに強調する', () => {
    renderCard('😀AWS😀', 'aws');

    expect(marks()).toEqual(['AWS']);
    expect(excerptElement().textContent).toBe('😀AWS😀');
  });
});

describe('検索語の強調(画面からAPIまで)', () => {
  test('URLの検索語をAPIに送り、返ってきた要約の中の検索語を強調する', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json({ id: 1, email: 'test-user@example.com' });
      if (url === '/api/job-postings/status-summary') {
        return json({ saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
      }
      if (url.startsWith('/api/job-postings?')) {
        return json({
          content: [listed('…仕事内容 開発環境 AWS、Kubernetes、Terraform 他…')],
          page: 0, size: 5, totalElements: 1, totalPages: 1, first: true, last: true,
        });
      }
      return json({});
    }));

    render(
      <MemoryRouter initialEntries={['/?keyword=kubernetes']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    const card = (await screen.findByRole('link', { name: 'バックエンドエンジニア' })).closest('li') as HTMLElement;
    expect(within(card).getByText('Kubernetes').tagName).toBe('MARK');
    const listCall = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/job-postings?'));
    expect(new URLSearchParams(listCall?.split('?')[1]).get('keyword')).toBe('kubernetes');

    // 入力欄に打っただけでは検索していないため、強調を変えない。
    const searchBox = screen.getByLabelText('検索キーワード');
    await userEvent.setup().clear(searchBox);
    await userEvent.setup().type(searchBox, 'terraform');
    expect(within(card).getByText('Kubernetes').tagName).toBe('MARK');
    expect(within(card).queryByText('Terraform', { selector: 'mark' })).not.toBeInTheDocument();

    document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    switchAuthContext(null);
  });
});

beforeEach(() => {
  sessionStorage.clear();
});
