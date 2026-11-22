import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import {
  fetchApplicationStatusHistory,
  fetchJobPosting,
  fetchJobPostingAnalysis,
  updateJobPosting,
} from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type {
  AnalysisEvidence,
  FixedOvertimeAnalysis,
  JobPosting,
  JobPostingAnalysis,
  SkillAnalysis,
  UpdateJobPostingRequest,
} from '../types/jobPosting';

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi');

const OVERTIME_LINE = '月給30万円（固定残業代40時間分を含む）';
const EXCESS_LINE = '超過分は別途支給';
const JAVA_LINE = 'Java経験3年以上';
const PYTHON_LINE = 'PythonまたはGoの経験';
const ORIGINAL = `給与\n${OVERTIME_LINE}\n${EXCESS_LINE}\n必須\n${JAVA_LINE}\n歓迎\n${PYTHON_LINE}`;
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

function evidenceOf(section: string, text: string): AnalysisEvidence {
  const start = ORIGINAL.indexOf(text);
  return { section, text, start, end: start + text.length };
}

const OVERTIME = evidenceOf('給与', OVERTIME_LINE);
const EXCESS = evidenceOf('給与', EXCESS_LINE);
const JAVA = evidenceOf('必須', JAVA_LINE);
const PYTHON = evidenceOf('歓迎', PYTHON_LINE);

const PRESENT: FixedOvertimeAnalysis = {
  status: 'PRESENT', hours: 40, excessPayStated: true, evidence: [OVERTIME, EXCESS],
};
const NOT_MENTIONED: FixedOvertimeAnalysis = {
  status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [],
};

const SKILLS: SkillAnalysis[] = [
  { name: 'Java', level: 'REQUIRED', alternatives: [], evidence: [JAVA] },
  { name: 'Python', level: 'PREFERRED', alternatives: ['Go'], evidence: [PYTHON] },
  { name: 'Go', level: 'PREFERRED', alternatives: ['Python'], evidence: [PYTHON] },
  // 固定残業代の根拠と同じ行。
  { name: 'AWS', level: 'MENTIONED', alternatives: [], evidence: [OVERTIME] },
  // 原文のその位置の文と違う根拠。
  { name: 'Docker', level: 'MENTIONED', alternatives: [], evidence: [{ ...JAVA, text: 'Docker' }] },
  // 固定残業代の根拠と一部だけ重なる根拠。
  {
    name: 'Rust',
    level: 'MENTIONED',
    alternatives: [],
    evidence: [{ ...OVERTIME, end: OVERTIME.start + 5, text: OVERTIME_LINE.slice(0, 5) }],
  },
];

function analysisWith(fixedOvertime: FixedOvertimeAnalysis): JobPostingAnalysis {
  return { fixedOvertime, skills: SKILLS };
}

async function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/job-postings/5']}>
      <AuthenticatedApp />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: jobPosting.title });
  const user = userEvent.setup();
  await user.click(await screen.findByText('判定の根拠を見る'));
  return user;
}

const originalRegion = () => screen.getByRole('region', { name: '求人票の原文' });
const originalParagraph = () =>
  originalRegion().querySelector('.detail-posting__original-text') as HTMLElement;
const marks = () => Array.from(originalRegion().querySelectorAll('mark'));
const skillEvidence = () =>
  screen.getByText('判定の根拠を見る').closest('details') as HTMLElement;
const skillButtons = () => within(skillEvidence()).queryAllByRole('button', { name: '原文で見る' });
// 技術の根拠のボタン。技術の名前と根拠の行の文で探す。
const skillButton = (label: string, line: string) => {
  const button = skillButtons().find((candidate) => {
    const description = candidate.getAttribute('aria-describedby') ?? '';
    const texts = description.split(' ').map((id) => document.getElementById(id)?.textContent);
    return texts[0] === label && texts[1] === line;
  });
  if (button === undefined) {
    throw new Error(`${label}の根拠のボタンがありません`);
  }
  return button;
};
const describedText = (element: Element) =>
  document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;
const markOf = (text: string) => marks().find((mark) => mark.textContent === text);

beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchJobPosting).mockResolvedValue(jobPosting);
  // 実際の応答と同じく、取得のたびに別のオブジェクトを返す。
  vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith(PRESENT));
  vi.mocked(fetchApplicationStatusHistory).mockResolvedValue([]);
  vi.mocked(getJobPostingMemos).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('技術の根拠を原文で見る', () => {
  test('原文と一致し、固定残業代の根拠と一部だけ重ならない根拠にだけボタンを出す', async () => {
    await renderDetail();

    // Java、Python・Goのいずれか、AWSの3つ。DockerとRustには出さない。
    expect(skillButtons()).toHaveLength(3);
    expect(skillButton('Java', JAVA_LINE)).toBeInTheDocument();
    expect(skillButton('Python・Goのいずれか', PYTHON_LINE)).toBeInTheDocument();
    expect(skillButton('AWS', OVERTIME_LINE)).toBeInTheDocument();
    // 押すまでは、技術の根拠を強調しない。
    expect(marks().map((mark) => mark.textContent)).toEqual([OVERTIME_LINE, EXCESS_LINE]);
  });

  test('押した技術の根拠の行だけを強調し、画面の中央に出してフォーカスする', async () => {
    const user = await renderDetail();

    await user.click(skillButton('Java', JAVA_LINE));

    const java = markOf(JAVA_LINE);
    expect(java).toBeDefined();
    expect(java).toHaveFocus();
    expect(java).toHaveClass(CURRENT);
    expect(java?.tabIndex).toBe(-1);
    expect(markOf(OVERTIME_LINE)).not.toHaveClass(CURRENT);
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([java]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(describedText(java as Element)).toBe('「Java」の判定の根拠');
    expect(within(originalRegion()).getByText('選択中の行は「Java」の判定の根拠です。')).toBeInTheDocument();
    // 固定残業代の案内は件数を変えずに残す。
    expect(within(originalRegion()).getByText('色付きの行は固定残業代の判定の根拠です（2か所）。'))
      .toBeInTheDocument();
    expect(originalParagraph().textContent).toBe(ORIGINAL);
  });

  test('別の技術を押すと、強調をその行に移す', async () => {
    const user = await renderDetail();
    await user.click(skillButton('Java', JAVA_LINE));

    await user.click(skillButton('Python・Goのいずれか', PYTHON_LINE));

    expect(markOf(JAVA_LINE)).toBeUndefined();
    const python = markOf(PYTHON_LINE);
    expect(python).toHaveFocus();
    expect(python).toHaveClass(CURRENT);
    expect(describedText(python as Element)).toBe('「Python・Goのいずれか」の判定の根拠');
    expect(within(originalRegion()).getByText('選択中の行は「Python・Goのいずれか」の判定の根拠です。'))
      .toBeInTheDocument();
    expect(within(originalRegion()).queryByText(/「Java」/)).not.toBeInTheDocument();
    expect(originalParagraph().textContent).toBe(ORIGINAL);
  });

  test('固定残業代の根拠と同じ行は、同じ強調を使い、両方の判定の根拠として読み上げる', async () => {
    const user = await renderDetail();

    await user.click(skillButton('AWS', OVERTIME_LINE));

    expect(marks()).toHaveLength(2);
    const overtime = markOf(OVERTIME_LINE);
    expect(overtime).toHaveFocus();
    expect(overtime).toHaveClass(CURRENT);
    expect(describedText(overtime as Element)).toBe('固定残業代と「AWS」の判定の根拠');
    expect(describedText(markOf(EXCESS_LINE) as Element)).toBe('固定残業代の判定の根拠');
    expect(within(originalRegion()).getByText('選択中の行は「AWS」の判定の根拠です。')).toBeInTheDocument();
  });

  test('固定残業代の根拠を押すと、技術の根拠の強調と案内を消す', async () => {
    const user = await renderDetail();
    await user.click(skillButton('Java', JAVA_LINE));

    const overtimeButtons = within(screen.getByRole('list', { name: '根拠' }))
      .getAllByRole('button', { name: '原文で見る' });
    await user.click(overtimeButtons[1]);

    expect(markOf(JAVA_LINE)).toBeUndefined();
    expect(markOf(EXCESS_LINE)).toHaveFocus();
    expect(markOf(EXCESS_LINE)).toHaveClass(CURRENT);
    expect(within(originalRegion()).queryByText(/選択中の行/)).not.toBeInTheDocument();
  });

  test('固定残業代の根拠がなくても、技術の根拠は強調して案内する', async () => {
    vi.mocked(fetchJobPostingAnalysis).mockImplementation(async () => analysisWith(NOT_MENTIONED));
    const user = await renderDetail();
    expect(marks()).toHaveLength(0);

    await user.click(skillButton('Java', JAVA_LINE));

    expect(marks().map((mark) => mark.textContent)).toEqual([JAVA_LINE]);
    expect(markOf(JAVA_LINE)).toHaveFocus();
    expect(within(originalRegion()).getByText('選択中の行は「Java」の判定の根拠です。')).toBeInTheDocument();
    expect(within(originalRegion()).queryByText(/固定残業代の判定の根拠です/)).not.toBeInTheDocument();
  });

  test('ボタンは、どの技術のどの行の根拠かを読み上げられる', async () => {
    await renderDetail();

    expect(skillButton('Java', JAVA_LINE)).toHaveAccessibleDescription(`Java ${JAVA_LINE}`);
  });

  test('原文を変えて分析を取り直したら、技術の根拠の強調を消す', async () => {
    vi.mocked(updateJobPosting).mockImplementation(async (_id, request: UpdateJobPostingRequest) => ({
      ...jobPosting, ...request, version: 4,
    }));
    const user = await renderDetail();
    await user.click(skillButton('Java', JAVA_LINE));
    expect(markOf(JAVA_LINE)).toBeDefined();

    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.type(screen.getByLabelText('求人原文'), '（追記）');
    await user.click(screen.getByRole('button', { name: /^保存/ }));

    await waitFor(() => expect(fetchJobPostingAnalysis).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(marks()).toHaveLength(2));
    expect(markOf(JAVA_LINE)).toBeUndefined();
    expect(within(originalRegion()).queryByText(/選択中の行/)).not.toBeInTheDocument();
  });
});
