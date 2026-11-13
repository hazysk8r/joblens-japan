import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, test } from 'vitest';

import JobPostingAnalysisPanel from '../components/JobPostingAnalysisPanel';
import type { FixedOvertimeAnalysis, JobPostingAnalysis, SkillAnalysis } from '../types/jobPosting';

afterEach(() => {
  cleanup();
});

function renderPanel(fixedOvertime: FixedOvertimeAnalysis, skills: SkillAnalysis[] = []) {
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

  const evidence = (text: string, section: string | null = '応募資格') => ({ section, text, start: 0, end: 0 });
  const skill = (
    name: string,
    level: SkillAnalysis['level'],
    text: string,
    alternatives: string[] = [],
  ): SkillAnalysis => ({ name, level, alternatives, evidence: [evidence(text)] });

  const skillSection = () => screen.getByRole('region', { name: '技術スタック' });
  const itemsOf = (groupLabel: string) =>
    within(within(skillSection()).getByRole('list', { name: groupLabel }))
      .getAllByRole('listitem').map((item) => item.textContent);

  test('判定ごとにまとめ、表示のない判定を「必須」や「歓迎」と書かない', () => {
    renderPanel(notMentioned, [
      skill('Java', 'REQUIRED', '必須：Java'),
      skill('AWS', 'PREFERRED', 'AWS経験あれば尚可'),
      skill('Python', 'IN_REQUIREMENTS', 'Pythonの実務経験'),
      { name: 'Go', level: 'UNDETERMINED', alternatives: [], evidence: [evidence('必須：Go言語'), evidence('Go言語経験不問')] },
      skill('Docker', 'MENTIONED', 'Dockerで開発', ),
    ]);

    expect(itemsOf('必須')).toEqual(['Java']);
    expect(itemsOf('歓迎')).toEqual(['AWS']);
    expect(itemsOf('応募資格に記載（必須・歓迎の記載なし）')).toEqual(['Python']);
    expect(itemsOf('判定できず（記載が矛盾しています）')).toEqual(['Go']);
    expect(itemsOf('その他の記載（業務内容・開発環境など）')).toEqual(['Docker']);
  });

  test('いずれかの技術は、全部が必要だと読めないよう1つにまとめる', () => {
    renderPanel(notMentioned, [
      skill('Java', 'REQUIRED', 'Java、Python、Go言語いずれかの経験', ['Python', 'Go']),
      skill('Python', 'REQUIRED', 'Java、Python、Go言語いずれかの経験', ['Java', 'Go']),
      skill('Go', 'REQUIRED', 'Java、Python、Go言語いずれかの経験', ['Java', 'Python']),
      skill('Kotlin', 'REQUIRED', 'Kotlinの経験'),
    ]);

    expect(itemsOf('必須')).toEqual(['Java・Python・Goのいずれか', 'Kotlin']);
  });

  test('いずれかの技術は、根拠の文に書かれた順に並べる', () => {
    // 単独の必須(Java)が別にあると、いずれかのまとまりはKotlinの判定として届く。
    renderPanel(notMentioned, [
      skill('Java', 'REQUIRED', 'Javaでの開発経験3年以上'),
      skill('Kotlin', 'REQUIRED', 'JavaまたはKotlinの実務経験', ['Java']),
    ]);

    expect(itemsOf('必須')).toEqual(['Java', 'Java・Kotlinのいずれか']);
  });

  test('判定のない欄は表示しない', () => {
    renderPanel(notMentioned, [skill('Java', 'REQUIRED', '必須：Java')]);

    expect(within(skillSection()).queryByRole('list', { name: '歓迎' })).not.toBeInTheDocument();
    expect(within(skillSection()).queryByRole('list', { name: '応募資格に記載（必須・歓迎の記載なし）' }))
      .not.toBeInTheDocument();
  });

  test('判定の根拠は開いたときに見せ、技術ごとに区間と文を示す', async () => {
    const user = userEvent.setup();
    renderPanel(notMentioned, [
      skill('Java', 'REQUIRED', '必須：Java'),
      { name: 'Go', level: 'UNDETERMINED', alternatives: [], evidence: [evidence('必須：Go言語'), evidence('Go言語経験不問', null)] },
    ]);
    const details = within(skillSection()).getByText('判定の根拠を見る').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);

    await user.click(within(skillSection()).getByText('判定の根拠を見る'));

    expect(details.open).toBe(true);
    const items = within(within(details).getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Java応募資格必須：Java',
      'Go応募資格必須：Go言語Go言語経験不問',
    ]);
  });

  test('知らない判定の技術は表示しない', () => {
    renderPanel(notMentioned, [
      skill('Java', 'REQUIRED', '必須：Java'),
      skill('Rust', 'SOMETHING_NEW' as SkillAnalysis['level'], 'Rust'),
    ]);

    expect(skillSection()).not.toHaveTextContent('Rust');
  });

  test('辞書にある技術名だけを表示することを伝える', () => {
    renderPanel(notMentioned, [skill('Java', 'MENTIONED', 'Javaで開発')]);

    expect(within(skillSection()).getByText('辞書にある技術名だけを表示します。')).toBeInTheDocument();
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
