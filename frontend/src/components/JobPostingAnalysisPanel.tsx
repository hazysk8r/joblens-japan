import { useId } from 'react';

import type {
  AnalysisEvidence,
  FixedOvertimeAnalysis,
  JobPostingAnalysis,
} from '../types/jobPosting';
import './JobPostingAnalysisPanel.css';

type JobPostingAnalysisPanelProps = {
  id: string;
  analysis: JobPostingAnalysis;
};

type Verdict = {
  label: string;
  note: string | null;
  tone: 'warning' | 'neutral';
};

function fixedOvertimeVerdict(result: FixedOvertimeAnalysis): Verdict {
  switch (result.status) {
    case 'PRESENT':
      return {
        label: result.hours !== null
          ? `あり（月${result.hours}時間分）`
          : 'あり（時間数は特定できず）',
        note: null,
        tone: 'warning',
      };
    case 'ABSENT':
      return {
        label: 'なし',
        note: '固定残業代がないこと、または残業代を全額支給することが書かれています。',
        tone: 'neutral',
      };
    case 'NOT_MENTIONED':
      return {
        label: '記載なし',
        note: '記載がないことは「固定残業代なし」を意味しません。',
        tone: 'neutral',
      };
    case 'UNDETERMINED':
      return {
        label: '判定できず',
        note: '残業代についての記載を解釈できないか、記載が矛盾しています。根拠の文を確認してください。',
        tone: 'warning',
      };
    default: {
      // 状態を追加したときに表示の追加漏れを型チェックで検出する。
      const unexpected: never = result.status;
      throw new Error(`未対応の判定です: ${String(unexpected)}`);
    }
  }
}

function EvidenceList({ evidence }: { evidence: AnalysisEvidence[] }) {
  if (evidence.length === 0) {
    return null;
  }
  return (
    <ul aria-label="根拠" className="job-posting-analysis__evidence">
      {evidence.map((item, index) => (
        // 同じ文が別の区間にあり得るため、順番も含めてキーにする。
        <li key={`${index}-${item.text}`}>
          {item.section !== null && (
            <span className="job-posting-analysis__evidence-section">
              {item.section}
            </span>
          )}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

export default function JobPostingAnalysisPanel({
  id,
  analysis,
}: JobPostingAnalysisPanelProps) {
  const headingId = useId();
  const fixedOvertimeHeadingId = `${headingId}-fixed-overtime`;
  const skillsHeadingId = `${headingId}-skills`;
  const { fixedOvertime, skills } = analysis;
  const verdict = fixedOvertimeVerdict(fixedOvertime);

  return (
    <div id={id} className="job-posting-analysis">
      <section aria-labelledby={fixedOvertimeHeadingId}>
        <h3 id={fixedOvertimeHeadingId} className="job-posting-analysis__heading">
          固定残業代
        </h3>
        <p
          className={`job-posting-analysis__verdict job-posting-analysis__verdict--${verdict.tone}`}
        >
          {verdict.label}
        </p>
        {fixedOvertime.status === 'PRESENT' && (
          <p className="job-posting-analysis__detail">
            {fixedOvertime.excessPayStated
              ? '超過分の支給：記載あり'
              : '超過分の支給：記載なし'}
          </p>
        )}
        {verdict.note !== null && (
          <p className="job-posting-analysis__note">{verdict.note}</p>
        )}
        <EvidenceList evidence={fixedOvertime.evidence} />
      </section>

      <section aria-labelledby={skillsHeadingId}>
        <h3 id={skillsHeadingId} className="job-posting-analysis__heading">
          技術スタック
        </h3>
        {skills.length > 0 ? (
          <ul className="job-posting-card__skills">
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        ) : (
          <p>抽出された技術スタックはありません。</p>
        )}
      </section>

      <p className="job-posting-analysis__disclaimer">
        自動判定のため、誤りがある可能性があります。
      </p>
    </div>
  );
}
