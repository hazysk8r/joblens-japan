import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * メモの編集の競合から、最新の内容を読み込んで保存し直すまでの通信のつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → API関数 → apiClient は実際のコード)。
 * サーバーは実際と同じく、If-Matchのバージョンが今のバージョンと違えば412を返す。
 */

const POSTING_URL = '/api/job-postings/1';
const NOTES_URL = '/api/job-postings/1/notes';
const NOTE_URL = '/api/job-postings/1/notes/1';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubServer() {
  let note = { id: 1, content: '書類通過', createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z', version: 0 };

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/auth/me') return json({ id: 1, email: 'test-user@example.com' });
    if (url === '/api/job-postings/status-summary') {
      return json({ saved: 0, applied: 0, interviewing: 0, offered: 0, rejected: 0 });
    }
    if (url === POSTING_URL) {
      return json({
        id: 1, companyName: '○○株式会社', title: 'バックエンドエンジニア', sourceUrl: null,
        originalText: '求人の原文', createdAt: '2026-11-08T00:00:00Z', applicationStatus: 'SAVED',
        salaryMin: null, salaryMax: null, applicationDeadline: null, version: 0,
      });
    }
    if (url === `${POSTING_URL}/analysis`) {
      return json({
        fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
        skills: [],
      });
    }
    if (url === `${POSTING_URL}/status-history`) return json([]);
    if (url === NOTES_URL) return json([note]);
    if (url === NOTE_URL && method === 'PUT') {
      const ifMatch = new Headers(init?.headers).get('If-Match');
      if (ifMatch !== `"${note.version}"`) {
        return json({ status: 412, code: 'JOB_POSTING_MEMO_VERSION_CONFLICT', message: 'conflict' }, 412);
      }
      const { content } = JSON.parse(String(init?.body)) as { content: string };
      note = { ...note, content, version: note.version + 1 };
      return json(note);
    }
    return json({}, 500);
  }));

  return {
    // 別の画面で先に保存された状態にする。
    saveElsewhere(content: string) {
      note = { ...note, content, version: note.version + 1 };
    },
  };
}

function putCalls() {
  return vi.mocked(fetch).mock.calls
    .filter(([url, init]) => url === NOTE_URL && init?.method === 'PUT')
    .map(([, init]) => ({
      ifMatch: new Headers(init?.headers).get('If-Match'),
      body: JSON.parse(String(init?.body)) as unknown,
    }));
}

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

test('競合したら最新の内容を読み込み、新しいバージョンで保存し直せる', async () => {
  const server = stubServer();
  render(
    <MemoryRouter initialEntries={['/job-postings/1']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  const memoRegion = () => screen.getByRole('region', { name: 'メモ' });
  const editor = () => within(memoRegion()).getByRole('textbox', { name: 'メモを編集' });
  const user = userEvent.setup();
  await within(await screen.findByRole('region', { name: 'メモ' })).findByText('書類通過');

  await user.click(within(memoRegion()).getByRole('button', { name: '編集' }));
  server.saveElsewhere('面接は11/30');
  await user.type(editor(), 'の追記');
  await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

  const latest = await within(memoRegion()).findByRole('region', { name: '最新の内容' });
  expect(latest).toHaveTextContent('面接は11/30');
  expect(editor()).toHaveValue('書類通過の追記');

  await user.click(within(memoRegion()).getByRole('button', { name: '入力を破棄して最新の内容を読み込む' }));
  await waitFor(() => expect(editor()).toHaveValue('面接は11/30'));
  await user.type(editor(), '（オンライン）');
  await user.click(within(memoRegion()).getByRole('button', { name: '保存' }));

  await waitFor(() => expect(within(memoRegion()).queryByRole('textbox', { name: 'メモを編集' })).not.toBeInTheDocument());
  expect(within(memoRegion()).getByText('面接は11/30（オンライン）')).toBeInTheDocument();
  expect(putCalls()).toEqual([
    { ifMatch: '"0"', body: { content: '書類通過の追記' } },
    { ifMatch: '"1"', body: { content: '面接は11/30（オンライン）' } },
  ]);
});
