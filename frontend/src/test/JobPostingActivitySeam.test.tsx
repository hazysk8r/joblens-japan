import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 詳細画面の応募ステータスとメモから通信までのつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → API関数 → apiClient は実際のコード)。
 * モジュールのmockでは見えない、実際のURL・If-Match・本文・中断を確かめる。
 */

const POSTING_URL = '/api/job-postings/1';
const STATUS_URL = '/api/job-postings/1/status';
const HISTORY_URL = '/api/job-postings/1/status-history';
const NOTES_URL = '/api/job-postings/1/notes';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// 実際のサーバーと同じく、状態を変更するたびにversionが増える。
function stubServer(
  overrides: Record<string, () => Response | Promise<Response>> = {},
  session: { loggedIn: boolean; userId: number; postNotes?: () => Response } = { loggedIn: true, userId: 1 },
) {
  let posting = {
    id: 1,
    companyName: '○○株式会社',
    title: 'バックエンドエンジニア',
    sourceUrl: null,
    originalText: '求人の原文',
    createdAt: '2026-11-08T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };
  let notes: { id: number; content: string; createdAt: string; updatedAt: string }[] = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET' && overrides[url]) return overrides[url]();
    if (url === '/api/auth/me') {
      return session.loggedIn
        ? json({ id: session.userId, email: 'test-user@example.com' })
        : json({ code: 'UNAUTHORIZED', message: 'ログインが必要です。' }, 401);
    }
    if (url === '/api/auth/logout') {
      session.loggedIn = false;
      return new Response(null, { status: 204 });
    }
    if (url === '/api/job-postings/status-summary') {
      return json({ saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    if (url.startsWith('/api/job-postings?')) {
      return json({ content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true });
    }
    if (url === POSTING_URL) return json(posting);
    if (url === `${POSTING_URL}/analysis`) {
      return json({
        fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
        skills: [],
      });
    }
    if (url === HISTORY_URL) return json([]);
    if (url === STATUS_URL && method === 'PATCH') {
      const { status } = JSON.parse(String(init?.body)) as { status: string };
      posting = { ...posting, applicationStatus: status, version: posting.version + 1 };
      return json(posting);
    }
    if (url === NOTES_URL && method === 'POST' && session.postNotes) return session.postNotes();
    if (url === NOTES_URL && method === 'POST') {
      const { content } = JSON.parse(String(init?.body)) as { content: string };
      const note = { id: 1, content, createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z' };
      notes = [note];
      return json(note, 201);
    }
    if (url === NOTES_URL) return json(notes);
    return json({}, 500);
  }));
}

function callsTo(target: string, method = 'GET') {
  return vi.mocked(fetch).mock.calls.filter(([url, init]) =>
    url === target && (init?.method ?? 'GET') === method);
}

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/job-postings/1']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: 'バックエンドエンジニア' });
  return userEvent.setup();
}

const statusSelect = () => screen.getByRole('combobox', { name: '応募ステータス' });

beforeEach(() => {
  sessionStorage.clear();
  document.cookie = 'XSRF-TOKEN=token-1; path=/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

describe('応募ステータスの変更', () => {
  test('続けて変更すると、2回目は1回目の応答のversionをIf-Matchで送る', async () => {
    stubServer();
    const user = await renderDetail();
    await waitFor(() => expect(callsTo(HISTORY_URL)).toHaveLength(1));

    await user.selectOptions(statusSelect(), 'APPLIED');
    await user.click(screen.getByRole('button', { name: '変更' }));
    await waitFor(() => expect(statusSelect()).toBeEnabled());
    await waitFor(() => expect(callsTo(HISTORY_URL)).toHaveLength(2));
    await user.selectOptions(statusSelect(), 'INTERVIEWING');
    await user.click(screen.getByRole('button', { name: '変更' }));
    await waitFor(() => expect(statusSelect()).toHaveValue('INTERVIEWING'));

    const requests = callsTo(STATUS_URL, 'PATCH').map(([, init]) => ({
      ifMatch: new Headers(init?.headers).get('If-Match'),
      body: init?.body,
    }));
    expect(requests).toEqual([
      { ifMatch: '"0"', body: JSON.stringify({ status: 'APPLIED' }) },
      { ifMatch: '"1"', body: JSON.stringify({ status: 'INTERVIEWING' }) },
    ]);
    await waitFor(() => expect(callsTo(HISTORY_URL)).toHaveLength(3));
    expect(callsTo(POSTING_URL)).toHaveLength(1);
    expect(callsTo(`${POSTING_URL}/analysis`)).toHaveLength(1);
  });
});

describe('メモ', () => {
  test('登録すると実際のURLに本文を送り、一覧を取り直して表示する', async () => {
    stubServer();
    const user = await renderDetail();
    const memos = screen.getByRole('region', { name: 'メモ' });
    await within(memos).findByText('登録されたメモはありません。');

    await user.type(within(memos).getByLabelText('メモ内容'), '面談準備');
    await user.click(within(memos).getByRole('button', { name: '登録' }));

    expect(await within(memos).findByText('面談準備')).toBeInTheDocument();
    expect(callsTo(NOTES_URL, 'POST')[0][1]?.body).toBe(JSON.stringify({ content: '面談準備' }));
    expect(callsTo(NOTES_URL)).toHaveLength(2);
  });

  test('通信に失敗したら、英語の文言ではなく既定のメッセージを表示する', async () => {
    stubServer({ [NOTES_URL]: () => Promise.reject(new TypeError('Failed to fetch')) });
    await renderDetail();
    const memos = screen.getByRole('region', { name: 'メモ' });

    expect(await within(memos).findByRole('alert')).toHaveTextContent(/^メモの取得に失敗しました。$/);
  });
});

describe('画面を離れたとき', () => {
  // apiClientは認証用のsignalを常に付けるため、signalの有無ではなく、実際に中断されることを確かめる。
  test.each([
    ['メモ', NOTES_URL],
    ['変更履歴', HISTORY_URL],
  ])('応答を待っている%sの通信を中断する', async (_, target) => {
    stubServer({ [target]: () => new Promise<Response>(() => {}) });
    const user = await renderDetail();
    await waitFor(() => expect(callsTo(target)).toHaveLength(1));
    const signal = callsTo(target)[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    expect(signal?.aborted).toBe(true);
  });
});

describe('作成中のメモの一時保存', () => {
  const DRAFT_KEY = 'joblens.memo-draft.1.1';
  const memoField = () => screen.getByLabelText('メモ内容');

  function renderAt(path: string) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  test('セッションが切れて登録できなくても、ログインし直すと入力が残っている', async () => {
    const session: { loggedIn: boolean; userId: number; postNotes: () => Response } = {
      loggedIn: true,
      userId: 1,
      postNotes: () => {
        session.loggedIn = false;
        return json({ code: 'UNAUTHORIZED', message: 'ログインが必要です。' }, 401);
      },
    };
    stubServer({}, session);
    const user = await renderDetail();
    await user.type(memoField(), '長く書いた面接メモ');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText(/セッションの有効期限が切れました/)).toBeInTheDocument();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBe('長く書いた面接メモ');

    cleanup();
    switchAuthContext(null);
    session.loggedIn = true;
    await renderDetail();

    expect(memoField()).toHaveValue('長く書いた面接メモ');
  });

  test('ログイン中のユーザーのIDで保存する', async () => {
    stubServer({}, { loggedIn: true, userId: 3 });
    const user = await renderDetail();

    await user.type(memoField(), '書きかけ');

    expect(sessionStorage.getItem('joblens.memo-draft.3.1')).toBe('書きかけ');
  });

  test('未ログインで開いただけなら残す', async () => {
    sessionStorage.setItem(DRAFT_KEY, '書きかけ');
    stubServer({}, { loggedIn: false, userId: 1 });

    renderAt('/job-postings/1');

    expect(await screen.findByRole('button', { name: 'ログイン' })).toBeInTheDocument();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBe('書きかけ');
  });

  test('ログアウトすると消え、関係のない保存値は残す', async () => {
    sessionStorage.setItem('other.key', '残す値');
    stubServer();
    const user = await renderDetail();
    await user.type(memoField(), '書きかけ');

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await screen.findByRole('button', { name: 'ログイン' });
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem('other.key')).toBe('残す値');
  });

  test('このタブの前回のユーザーと違うユーザーになると、前のユーザーの保存値を消す', async () => {
    sessionStorage.setItem('joblens.last-user-id', '2');
    sessionStorage.setItem('joblens.memo-draft.2.1', '前のユーザーの書きかけ');
    stubServer();

    renderAt('/job-postings/1');

    await waitFor(() => expect(sessionStorage.getItem('joblens.memo-draft.2.1')).toBeNull());
  });

  test('同じユーザーのままなら消さない', async () => {
    sessionStorage.setItem('joblens.last-user-id', '1');
    sessionStorage.setItem(DRAFT_KEY, '書きかけ');
    stubServer();

    await renderDetail();

    expect(memoField()).toHaveValue('書きかけ');
  });
});
