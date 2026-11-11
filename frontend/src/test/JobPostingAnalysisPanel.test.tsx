import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test } from 'vitest';

import JobPostingAnalysisPanel from '../components/JobPostingAnalysisPanel';
import type { FixedOvertimeAnalysis, JobPostingAnalysis } from '../types/jobPosting';

afterEach(() => {
  cleanup();
});

function renderPanel(fixedOvertime: FixedOvertimeAnalysis, skills: string[] = []) {
  const analysis: JobPostingAnalysis = { fixedOvertime, skills };
  render(<JobPostingAnalysisPanel analysis={analysis} />);
}

function fixedOvertimeSection() {
  return screen.getByRole('region', { name: '固定残業代' });
}

describe('見出しの構造', () => {
  test('詳細画面の「求人票の分析」の下に置くため、見出しは4階層目にする', () => {
    renderPanel({ status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] });

    expect(screen.getByRole('heading', { level: 4, name: '固定残業代' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: '技術スタック' })).toBeInTheDocument();
  });
});

describe('固定残業代の判定の表示', () => {
  test('ありの場合は時間数と超過分の支給と根拠を表示する', () => {
    renderPanel({
      status: 'PRESENT',
      hours: 40,
      excessPayStated: true,
      evidence: [
        { section: '給与', text: '月給30万円（固定残業代40時間分を含む）', start: 0, end: 0 },
        { section: null, text: '超過分は別途支給', start: 0, end: 0 },
      ],
    });

    const section = fixedOvertimeSection();
    expect(within(section).getByText('あり（月40時間分）')).toBeInTheDocument();
    expect(within(section).getByText('超過分の支給：記載あり')).toBeInTheDocument();

    const items = within(within(section).getByRole('list', { name: '根拠' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('給与月給30万円（固定残業代40時間分を含む）');
    expect(within(items[0]).getByText('給与')).toHaveClass('job-posting-analysis__evidence-section');
    // 見出しより前の行は区間名を表示しない。
    expect(items[1]).toHaveTextContent(/^超過分は別途支給$/);
  });

  test('ありでも時間数が特定できず超過分の支給も書かれていなければ、そのことを表示する', () => {
    renderPanel({
      status: 'PRESENT',
      hours: null,
      excessPayStated: false,
      evidence: [{ section: '給与', text: '基本給には固定残業手当を含む', start: 0, end: 0 }],
    });

    const section = fixedOvertimeSection();
    expect(within(section).getByText('あり（時間数は特定できず）')).toBeInTheDocument();
    expect(within(section).getByText('超過分の支給：記載なし')).toBeInTheDocument();
  });

  test.each([
    ['ABSENT', 'なし', '固定残業代がないこと、または残業代を全額支給することが書かれています。'],
    ['UNDETERMINED', '判定できず', '残業代についての記載を解釈できないか、記載が矛盾しています。根拠の文を確認してください。'],
  ] as const)('%sの場合は判定と説明と根拠を表示し、超過分の支給は表示しない', (status, verdict, note) => {
    renderPanel({
      status,
      hours: null,
      excessPayStated: null,
      evidence: [{ section: '待遇', text: '残業代の記載', start: 0, end: 0 }],
    });

    const section = fixedOvertimeSection();
    expect(within(section).getByText(verdict)).toBeInTheDocument();
    expect(within(section).getByText(note)).toBeInTheDocument();
    expect(within(section).queryByText(/超過分の支給/)).not.toBeInTheDocument();
    expect(within(section).getByRole('list', { name: '根拠' })).toHaveTextContent('待遇残業代の記載');
  });

  test('記載なしの場合は「なし」と同じではないことを伝え、根拠の一覧は表示しない', () => {
    renderPanel({ status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [] });

    const section = fixedOvertimeSection();
    expect(within(section).getByText('記載なし')).toBeInTheDocument();
    expect(within(section).getByText('記載がないことは「固定残業代なし」を意味しません。')).toBeInTheDocument();
    expect(within(section).queryByRole('list', { name: '根拠' })).not.toBeInTheDocument();
  });
});

describe('技術スタックと注意書きの表示', () => {
  const notMentioned: FixedOvertimeAnalysis = {
    status: 'NOT_MENTIONED', hours: null, excessPayStated: null, evidence: [],
  };

  test('技術名を一覧で表示する', () => {
    renderPanel(notMentioned, ['Java', 'AWS']);

    const section = screen.getByRole('region', { name: '技術スタック' });
    expect(within(section).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Java', 'AWS']);
  });

  test('技術名がなければメッセージを表示する', () => {
    renderPanel(notMentioned, []);

    const section = screen.getByRole('region', { name: '技術スタック' });
    expect(within(section).getByText('抽出された技術スタックはありません。')).toBeInTheDocument();
  });

  test('自動判定であることを常に表示する', () => {
    renderPanel(notMentioned);

    expect(screen.getByText('自動判定のため、誤りがある可能性があります。')).toBeInTheDocument();
  });
});
