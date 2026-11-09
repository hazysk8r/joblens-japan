import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { switchAuthContext } from '../api/apiClient';
import JobPostingListItem from '../components/JobPostingListItem';
import type { JobPosting } from '../types/jobPosting';

/**
 * 求人票の分析ボタンから画面表示までのつながりを検証する。
 * mockするのはfetchだけ(画面 → フック → jobPostingApi → apiClient は実際のコード)。
 * 応答の形はバックエンドのJobPostingControllerTestのAnalysisTestsと合わせる。
 */

const jobPosting: JobPosting = {
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

function stubAnalysisResponse(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/job-postings/1/analysis') return response();
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function clickAnalyze() {
  const user = userEvent.setup();
  render(
    <JobPostingListItem
      jobPosting={jobPosting}
      isEditing={false}
      isSaving={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onStartEdit={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onDelete={vi.fn()}
      onApplicationStatusChange={vi.fn()}
    />,
    { wrapper: MemoryRouter },
  );
  const button = screen.getByRole('button', { name: '求人票を分析' });
  await user.click(button);
  return button;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  switchAuthContext(null);
});

describe('求人票の分析', () => {
  test('分析結果の応答を受けると固定残業代の判定と根拠と技術スタックを表示する', async () => {
    const fetchMock = stubAnalysisResponse(() => json({
      fixedOvertime: {
        status: 'PRESENT',
        hours: 40,
        excessPayStated: false,
        evidence: [{ section: '給与', text: '月給30万円（固定残業代40時間分を含む）' }],
      },
      skills: ['Java'],
    }, 200));

    const button = await clickAnalyze();

    const fixedOvertime = await screen.findByRole('region', { name: '固定残業代' });
    expect(within(fixedOvertime).getByText('あり（月40時間分）')).toBeInTheDocument();
    expect(within(fixedOvertime).getByRole('list', { name: '根拠' }))
      .toHaveTextContent('給与月給30万円（固定残業代40時間分を含む）');
    expect(within(screen.getByRole('region', { name: '技術スタック' })).getByText('Java')).toBeInTheDocument();
    expect(button).toHaveTextContent('分析を閉じる');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('404の応答を受けるとサーバーのメッセージを表示し、ボタンを元に戻す', async () => {
    stubAnalysisResponse(() => json({
      status: 404,
      code: 'JOB_POSTING_NOT_FOUND',
      message: '求人が見つかりません。',
      path: '/api/job-postings/1/analysis',
      fieldErrors: {},
    }, 404));

    const button = await clickAnalyze();

    expect(await screen.findByRole('alert')).toHaveTextContent('求人が見つかりません。');
    expect(button).toHaveTextContent('求人票を分析');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  // apiClientは認証用のsignalを常に付けるため、signalの有無ではなく、実際に中断されることを確かめる。
  test('応答を待っている間に画面からなくなると、通信を中断する', async () => {
    stubAnalysisResponse(() => new Promise<Response>(() => {}));

    await clickAnalyze();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    cleanup();

    expect(signal?.aborted).toBe(true);
  });

  test('応答の本文がJSONでなければ既定のメッセージを表示する', async () => {
    stubAnalysisResponse(() => new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }));

    await clickAnalyze();

    expect(await screen.findByRole('alert')).toHaveTextContent('求人票の分析に失敗しました。');
  });
});
