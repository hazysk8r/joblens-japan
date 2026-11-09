import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from '../App';
import { switchAuthContext } from '../api/apiClient';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * 詳細画面の求人票の分析から通信までのつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → jobPostingApi → apiClient は実際のコード)。
 * 応答の形はバックエンドのJobPostingControllerTestのAnalysisTestsと合わせる。
 */

const ANALYSIS_URL = '/api/job-postings/1/analysis';

const jobPosting = {
  id: 1,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  originalText: '給与\n月給30万円（固定残業代40時間分を含む）',
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 0,
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubServer(analysisResponse: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/auth/me') return json({ id: 1, email: 'test-user@example.com' }, 200);
    if (url === '/api/job-postings/1') return json(jobPosting, 200);
    if (url === ANALYSIS_URL) return analysisResponse();
    return json({}, 500);
  }));
}

function analysisCalls() {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === ANALYSIS_URL);
}

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/job-postings/1']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function expectOriginalTextIsShown() {
  expect(within(await screen.findByRole('region', { name: '求人票の原文' }))
    .getByText(/月給30万円/)).toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('求人票の分析', () => {
  test('詳細画面を開くと分析のAPIを1回呼び、判定と根拠と技術スタックを表示する', async () => {
    stubServer(() => json({
      fixedOvertime: {
        status: 'PRESENT',
        hours: 40,
        excessPayStated: false,
        evidence: [{ section: '給与', text: '月給30万円（固定残業代40時間分を含む）' }],
      },
      skills: ['Java'],
    }, 200));

    renderDetail();

    const fixedOvertime = await screen.findByRole('region', { name: '固定残業代' });
    expect(within(fixedOvertime).getByText('あり（月40時間分）')).toBeInTheDocument();
    expect(within(fixedOvertime).getByRole('list', { name: '根拠' }))
      .toHaveTextContent('給与月給30万円（固定残業代40時間分を含む）');
    expect(within(screen.getByRole('region', { name: '技術スタック' })).getByText('Java')).toBeInTheDocument();
    expect(analysisCalls()).toHaveLength(1);
  });

  test('404の応答を受けるとサーバーのメッセージを表示し、原文は表示したまま', async () => {
    stubServer(() => json({
      status: 404,
      code: 'JOB_POSTING_NOT_FOUND',
      message: '求人が見つかりません。',
      path: ANALYSIS_URL,
      fieldErrors: {},
    }, 404));

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('求人が見つかりません。');
    await expectOriginalTextIsShown();
  });

  // ブラウザやJSONの解析が出す英語の文言や応答の本文を、そのまま画面に出さない。
  test.each<[string, () => Response | Promise<Response>]>([
    ['通信に失敗した', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['エラーの応答の本文がJSONでない', () => new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })],
    ['成功の応答の本文がJSONでない', () => new Response('<html>ok</html>', { status: 200 })],
  ])('%s場合は既定のメッセージと再試行を表示する', async (_, response) => {
    stubServer(response);

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(/^求人票の分析に失敗しました。$/);
    expect(screen.getByRole('button', { name: '分析を再試行' })).toBeInTheDocument();
    await expectOriginalTextIsShown();
  });

  // apiClientは認証用のsignalを常に付けるため、signalの有無ではなく、実際に中断されることを確かめる。
  test('応答を待っている間に一覧へ戻ると、通信を中断する', async () => {
    stubServer(() => new Promise<Response>(() => {}));
    const user = userEvent.setup();

    renderDetail();
    await waitFor(() => expect(analysisCalls()).toHaveLength(1));
    const signal = analysisCalls()[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    await user.click(screen.getByRole('link', { name: '← 求人一覧に戻る' }));

    expect(signal?.aborted).toBe(true);
  });
});
