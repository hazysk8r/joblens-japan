import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 求人登録の入力の一時保存と、ログイン状態の変化のつながりを検証する。
 * mockするのはfetchだけ(画面 → AuthProvider → apiClient は実際のコード)。
 */

const KEY = 'joblens.posting-draft.1';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const unauthorized = () => json({ code: 'UNAUTHORIZED', message: 'ログインが必要です。' }, 401);

function stubServer(session: { loggedIn: boolean; userId: number }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/auth/me') {
      return session.loggedIn ? json({ id: session.userId, email: 'test-user@example.com' }) : unauthorized();
    }
    if (url === '/api/auth/login') {
      session.loggedIn = true;
      return json({ id: session.userId, email: 'test-user@example.com' });
    }
    if (url === '/api/auth/logout') {
      session.loggedIn = false;
      return new Response(null, { status: 204 });
    }
    // セッションが切れた後の登録を再現する。
    if (url === '/api/job-postings' && method === 'POST') {
      session.loggedIn = false;
      return unauthorized();
    }
    return json({}, 500);
  }));
}

function renderNew() {
  render(
    <MemoryRouter initialEntries={['/job-postings/new']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('求人登録の入力の一時保存', () => {
  test('セッションが切れて登録できなくても、ログインし直すと入力が残っている', async () => {
    stubServer({ loggedIn: true, userId: 1 });
    const user = renderNew();
    await user.type(await screen.findByLabelText('求人タイトル'), '長いタイトル');
    await user.type(screen.getByLabelText('求人原文'), '貼り付けた長い求人票');

    await user.click(screen.getByRole('button', { name: '登録' }));

    await screen.findByText(/セッションの有効期限が切れました/);
    await user.type(screen.getByLabelText('メールアドレス'), 'test-user@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByLabelText('求人タイトル')).toHaveValue('長いタイトル');
    expect(screen.getByLabelText('求人原文')).toHaveValue('貼り付けた長い求人票');
    expect(screen.getByText('前回入力した内容を復元しました。')).toBeInTheDocument();
  });

  test('ログアウトすると消える', async () => {
    stubServer({ loggedIn: true, userId: 1 });
    const user = renderNew();
    await user.type(await screen.findByLabelText('求人タイトル'), '書きかけ');
    expect(sessionStorage.getItem(KEY)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'ログアウト' }));

    await screen.findByText('ログアウトしました。');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  test('このタブの前回のユーザーと違うユーザーになると、前のユーザーの保存値を消す', async () => {
    sessionStorage.setItem('joblens.last-user-id', '2');
    sessionStorage.setItem('joblens.posting-draft.2', JSON.stringify({ title: '前のユーザーの書きかけ' }));
    stubServer({ loggedIn: true, userId: 1 });

    renderNew();

    await waitFor(() => expect(sessionStorage.getItem('joblens.posting-draft.2')).toBeNull());
  });

  test('ログイン中のユーザーのIDで保存する', async () => {
    stubServer({ loggedIn: true, userId: 3 });
    const user = renderNew();

    await user.type(await screen.findByLabelText('求人タイトル'), '書きかけ');

    expect(sessionStorage.getItem('joblens.posting-draft.3')).toContain('書きかけ');
  });
});
