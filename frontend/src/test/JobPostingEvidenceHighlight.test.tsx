import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import {
  fetchApplicationStatusHistory,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  updateJobPosting,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type {
  AnalysisEvidence,
  JobPosting,
  JobPostingAnalysis,
  UpdateJobPostingRequest,
} from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const LINE_1 = '月給30万円（固定残業代40時間分を含む）';
const LINE_2 = '超過分は別途支給';
const ORIGINAL = `給与\n${LINE_1}\n${LINE_2}\n勤務地\n東京都`;
const CURRENT = 'detail-posting__evidence--current';

const jobPosting: JobPosting = {
  id: 5,
  companyName: '○○株式会社',
  title: 'バックエンドエンジニア',
  sourceUrl: null,
  originalText: ORIGINAL,
  createdAt: '2026-11-08T00:00:00Z',
  applicationStatus: 'SAVED',
  salaryMin: null,
  salaryMax: null,
  applicationDeadline: null,
  version: 3,
};

const EVIDENCE_1: AnalysisEvidence = { section: '給与', text: LINE_1, start: 3, end: 24 };
const EVIDENCE_2: AnalysisEvidence = { section: '給与', text: LINE_2, start: 25, end: 33 };

function analysisWith(evidence: AnalysisEvidence[]): JobPostingAnalysis {
  return {
    fixedOvertime: { status: 'PRESENT', hours: 40, excessPayStated: true, evidence },
    skills: [],
  };
}

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/job-postings/5']}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: jobPosting.title });
  return userEvent.setup();
}

const originalRegion = () => screen.getByRole('region', { name: '求人票の原文' });
const originalParagraph = () =>
  originalRegion().querySelector('.detail-posting__original-text') as HTMLElement;
const marks = () => Array.from(originalRegion().querySelectorAll('mark'));
const showButtons = () => screen.queryAllByRole('button', { name: '原文で見る' });
const describedText = (element: Element) =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  // 実際の応答と同じく、取得のたびに別のオブジェクトを返す。
  vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith([EVIDENCE_1, EVIDENCE_2]));
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('原文の中の根拠', () => {
  test('根拠の行を強調して件数を案内し、原文の文字は変えない', async () => {
    await renderDetail();

    await waitFor(() => expect(marks()).toHaveLength(2));
    expect(marks().map((mark) => mark.textContent)).toEqual([LINE_1, LINE_2]);
    // 複製したときに元の原文と同じになるよう、原文の中に文字を足さない。
    expect(originalParagraph().textContent).toBe(ORIGINAL);
    expect(within(originalRegion()).getByText('色付きの行は固定残業代の判定の根拠です（2か所）。'))
      .toBeInTheDocument();
  });

  test('切り詰められた根拠でも、原文では行全体を強調する', async () => {
    vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith([
      { ...EVIDENCE_1, text: `${LINE_1.slice(0, 10)}…` },
    ]));
    await renderDetail();

    await waitFor(() => expect(marks()).toHaveLength(1));
    expect(marks()[0]).toHaveTextContent(LINE_1);
  });

  test.each([
    // 位置の確かめがないと、文の一致だけでは見分けられない値にする。
    // sliceは範囲の外を切り詰め、負の位置を後ろから数え、逆の範囲を空にするため。
    ['範囲の外', { ...EVIDENCE_2, text: '超過分は…', end: 999 }],
    ['始まりと終わりが逆', { ...EVIDENCE_2, text: '', start: 33, end: 25 }],
    ['空の範囲', { ...EVIDENCE_2, text: '', end: 25 }],
    ['負の位置', { ...EVIDENCE_2, start: 25 - ORIGINAL.length }],
    ['整数でない位置', { ...EVIDENCE_2, start: 25.5 }],
    ['その位置の文と違う文', { ...EVIDENCE_2, text: '超過分は支給しない' }],
    ['切り詰めた文の前半が違う', { ...EVIDENCE_2, text: '超過分は全額…' }],
    ['前の根拠と重なる範囲', { ...EVIDENCE_2, start: 20, text: ORIGINAL.slice(20, 33) }],
  ])('%sの根拠は強調せず、原文で見るボタンも出さない', async (_, wrong) => {
    vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith([EVIDENCE_1, wrong]));
    await renderDetail();

    await waitFor(() => expect(marks()).toHaveLength(1));
    expect(marks()[0]).toHaveTextContent(LINE_1);
    expect(showButtons()).toHaveLength(1);
    expect(within(originalRegion()).getByText('色付きの行は固定残業代の判定の根拠です（1か所）。'))
      .toBeInTheDocument();
    expect(originalParagraph().textContent).toBe(ORIGINAL);
  });

  test('負の位置の根拠は、ほかの根拠と重ならなくても強調しない', async () => {
    // 負の位置は後ろから数えた範囲として同じ文を切り出せてしまうため、位置そのものを確かめる。
    vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith([
      { ...EVIDENCE_2, start: 25 - ORIGINAL.length },
    ]));
    await renderDetail();
    await screen.findByRole('list', { name: '根拠' });

    expect(marks()).toHaveLength(0);
    expect(showButtons()).toHaveLength(0);
    expect(originalParagraph().textContent).toBe(ORIGINAL);
  });

  test.each([
    ['分析中', () => new Promise<JobPostingAnalysis>(() => {})],
    ['分析の失敗', async () => { throw new ApiError('分析に失敗しました。', 500); }],
    ['記載なし', async () => ({
      fixedOvertime: { status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] },
      skills: [],
    } satisfies JobPostingAnalysis)],
  ] as const)('%sのときは強調も案内もしない', async (_, fetcher) => {
    vi.mocked(fetchJobPostingAnalysis).mockImplementation(fetcher);
    await renderDetail();

    expect(within(originalRegion()).getByText(/東京都/)).toBeInTheDocument();
    expect(marks()).toHaveLength(0);
    expect(within(originalRegion()).queryByText(/判定の根拠です/)).not.toBeInTheDocument();
    expect(originalParagraph().textContent).toBe(ORIGINAL);
  });
});

describe('原文で見る', () => {
  test('押した根拠の行を画面の中央に出してフォーカスし、見ている根拠として示す', async () => {
    const user = await renderDetail();
    await waitFor(() => expect(showButtons()).toHaveLength(2));

    await user.click(showButtons()[1]);

    const [first, second] = marks();
    expect(second).toHaveFocus();
    expect(second).toHaveClass(CURRENT);
    expect(first).not.toHaveClass(CURRENT);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([second]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });

    await user.click(showButtons()[0]);

    expect(first).toHaveFocus();
    expect(first).toHaveClass(CURRENT);
    expect(second).not.toHaveClass(CURRENT);
  });

  test('ボタンはどの根拠のものかを、強調した行は判定の根拠であることを読み上げられる', async () => {
    await renderDetail();
    await waitFor(() => expect(showButtons()).toHaveLength(2));

    expect(showButtons().map(describedText)).toEqual([LINE_1, LINE_2]);
    expect(marks().map(describedText)).toEqual(['固定残業代の判定の根拠', '固定残業代の判定の根拠']);
    expect(marks().every((mark) => mark.tabIndex === -1)).toBe(true);
  });

  test('原文を変えて分析を取り直したら、見ている根拠の表示を消す', async () => {
    vi.mocked(updateJobPosting).mockImplementation(async (_id, request: UpdateJobPostingRequest) => ({
      ...jobPosting, ...request, version: 4,
    }));
    const user = await renderDetail();
    await waitFor(() => expect(showButtons()).toHaveLength(2));
    await user.click(showButtons()[0]);
    expect(marks()[0]).toHaveClass(CURRENT);

    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.type(screen.getByLabelText('求人原文'), '（追記）');
    await user.click(screen.getByRole('button', { name: /^保存/ }));

    await waitFor(() => expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(marks()).toHaveLength(2));
    expect(originalParagraph().textContent).toBe(`${ORIGINAL}（追記）`);
    expect(marks().some((mark) => mark.classList.contains(CURRENT))).toBe(false);
  });
});
