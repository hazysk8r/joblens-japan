import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 詳細画面での求人の編集と削除から通信までのつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → API関数 → apiClient は実際のコード)。
 * モジュールのmockでは見えない、実際のURL・If-Match・本文と、ログイン状態の変化との関係を確かめる。
 */

const POSTING_URL = '/api/job-postings/1';
const EDIT_DRAFT_KEY = 'joblens.posting-edit-draft.1.1';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const unauthorized = () => json({ code: 'UNAUTHORIZED', message: 'ログインが必要です。' }, 401);

type Session = { loggedIn: boolean; expireOnSave?: boolean; userId?: number };

// 実際のサーバーと同じく、If-Matchのversionが違えば412を返し、保存するたびにversionが増える。
function stubServer(session: Session = { loggedIn: true }) {
  let posting = {
    id: 1,
    companyName: '○○株式会社',
    title: 'バックエンドエンジニア',
    sourceUrl: null as string | null,
    originalText: '求人の原文',
    createdAt: '2026-11-08T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null as number | null,
    salaryMax: null as number | null,
    applicationDeadline: null as string | null,
    version: 0,
  };

  const server = {
    // 別の画面での編集を再現する。
    editElsewhere(title: string) {
      posting = { ...posting, title, version: posting.version + 1 };
    },
  };

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/auth/me') {
      return session.loggedIn ? json({ id: session.userId ?? 1, email: 'test-user@example.com' }) : unauthorized();
    }
    if (url === '/api/auth/login') {
      session.loggedIn = true;
      return json({ id: 1, email: 'test-user@example.com' });
    }
    if (url === '/api/auth/logout') {
      session.loggedIn = false;
      return new Response(null, { status: 204 });
    }
    if (url === POSTING_URL && method === 'PUT') {
      if (session.expireOnSave) {
        session.loggedIn = false;
        session.expireOnSave = false;
        return unauthorized();
      }
      const ifMatch = new Headers(init?.headers).get('If-Match');
      if (ifMatch !== `"${posting.version}"`) {
        return json({ code: 'JOB_POSTING_VERSION_CONFLICT', message: '競合しました。' }, 412);
      }
      const request = JSON.parse(String(init?.body)) as Partial<typeof posting>;
      posting = { ...posting, ...request, version: posting.version + 1 };
      return json(posting);
    }
    if (url === POSTING_URL && method === 'DELETE') return new Response(null, { status: 204 });
    if (url === POSTING_URL) return json(posting);
    if (url === `${POSTING_URL}/analysis`) {
      return json({
        fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
        skills: [],
      });
    }
    if (url === `${POSTING_URL}/status-history` || url === `${POSTING_URL}/notes`) return json([]);
    if (url === '/api/job-postings/status-summary') {
      return json({ saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    if (url.startsWith('/api/job-postings?')) {
      return json({ content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, first: true, last: true });
    }
    return json({}, 500);
  }));

  return server;
}

function callsTo(target: string, method: string) {
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

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('求人の編集', () => {
  test('編集を始めたときのversionをIf-Matchで送り、本文に入力を送る', async () => {
    stubServer();
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.clear(field('求人タイトル'));
    await user.type(field('求人タイトル'), '新しいタイトル');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('heading', { level: 2, name: '新しいタイトル' })).toBeInTheDocument();
    const [[, init]] = callsTo(POSTING_URL, 'PUT');
    expect(new Headers(init?.headers).get('If-Match')).toBe('"0"');
    expect(JSON.parse(String(init?.body))).toEqual({
      companyName: '○○株式会社',
      title: '新しいタイトル',
      sourceUrl: null,
      originalText: '求人の原文',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
    });
  });

  test('別の画面で編集されていたら412になり、最新を読み込むと次は新しいversionで保存できる', async () => {
    const server = stubServer();
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集' }));
    server.editElsewhere('別の画面の変更');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(await screen.findByRole('button', { name: '入力を破棄して最新の内容を読み込む' }));
    await waitFor(() => expect(field('求人タイトル')).toHaveValue('別の画面の変更'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('求人を更新しました。')).toBeInTheDocument();
    const versions = callsTo(POSTING_URL, 'PUT').map(([, init]) => new Headers(init?.headers).get('If-Match'));
    expect(versions).toEqual(['"0"', '"1"']);
  });
});

describe('編集の一時保存', () => {
  test('保存のときにセッションが切れても、ログインし直すと保存していない編集を再開できる', async () => {
    const session: Session = { loggedIn: true, expireOnSave: true };
    stubServer(session);
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.clear(field('求人タイトル'));
    await user.type(field('求人タイトル'), '時間をかけた編集');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByText(/セッションの有効期限が切れました/);
    await user.type(screen.getByLabelText('メールアドレス'), 'test-user@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('保存していない編集内容があります。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '編集を再開' }));
    expect(field('求人タイトル')).toHaveValue('時間をかけた編集');
  });

  test('ログイン中のユーザーのIDで保存する', async () => {
    stubServer({ loggedIn: true, userId: 3 });
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集' }));

    await user.type(field('求人タイトル'), '書きかけ');

    expect(sessionStorage.getItem('joblens.posting-edit-draft.3.1')).toContain('書きかけ');
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
  });

  test('ログアウトすると消える', async () => {
    stubServer();
    const user = await renderDetail();
    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.type(field('求人タイトル'), '書きかけ');
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await screen.findByText('ログアウトしました。');
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull();
  });
});

describe('求人の削除', () => {
  test('実際のURLへDELETEを送り、一覧へ移動する', async () => {
    stubServer();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = await renderDetail();

    await user.click(screen.getByRole('button', { name: '削除' }));

    expect(await screen.findByRole('heading', { name: '求人検索' })).toBeInTheDocument();
    expect(callsTo(POSTING_URL, 'DELETE')).toHaveLength(1);
  });
});
