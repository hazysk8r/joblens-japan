import { useId } from 'react';

import type {
  AnalysisEvidence,
  JobPostingAnalysis,
} from '../types/jobPosting';
import { fixedOvertimeVerdict } from '../utils/fixedOvertimeVerdict';
import './JobPostingAnalysisPanel.css';

type JobPostingAnalysisPanelProps = {
  analysis: JobPostingAnalysis;
  // 根拠ごとに、原文の中で示せるか。示せる根拠にだけ「原文で見る」を出す。
  showableEvidence?: boolean[];
  onShowEvidence?: (index: number) => void;
};

function EvidenceList({
  evidence,
  showableEvidence,
  onShowEvidence,
}: {
  evidence: AnalysisEvidence[];
  showableEvidence: boolean[];
  onShowEvidence?: (index: number) => void;
}) {
  const idPrefix = useId();
  if (evidence.length === 0) {
    return null;
  }
  return (
    <ul aria-label="根拠" className="job-posting-analysis__evidence">
      {evidence.map((item, index) => {
        const textId = `${idPrefix}-evidence-${index}`;
        return (
          // 同じ文が別の区間にあり得るため、順番も含めてキーにする。
          <li key={`${index}-${item.text}`}>
            {item.section !== null && (
              <span className="job-posting-analysis__evidence-section">
                {item.section}
              </span>
            )}
            <span id={textId}>{item.text}</span>
            {onShowEvidence !== undefined && showableEvidence[index] === true && (
              // 同じ名前のボタンが並ぶため、どの根拠のボタンかを説明として読み上げる。
              <button
                type="button"
                className="job-posting-analysis__show-evidence"
                aria-describedby={textId}
                onClick={() => onShowEvidence(index)}
              >
                原文で見る
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function JobPostingAnalysisPanel({
  analysis,
  showableEvidence = [],
  onShowEvidence,
}: JobPostingAnalysisPanelProps) {
  const headingId = useId();
  const fixedOvertimeHeadingId = `${headingId}-fixed-overtime`;
  const skillsHeadingId = `${headingId}-skills`;
  const { fixedOvertime, skills } = analysis;
  const verdict = fixedOvertimeVerdict(fixedOvertime.status, fixedOvertime.hours);
  if (verdict === null) {
    throw new Error(`未対応の判定です: ${String(fixedOvertime.status)}`);
  }

  return (
    <div className="job-posting-analysis">
      <section aria-labelledby={fixedOvertimeHeadingId}>
        <h4 id={fixedOvertimeHeadingId} className="job-posting-analysis__heading">
          固定残業代
        </h4>
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
        <EvidenceList
          evidence={fixedOvertime.evidence}
          showableEvidence={showableEvidence}
          onShowEvidence={onShowEvidence}
        />
      </section>

      <section aria-labelledby={skillsHeadingId}>
        <h4 id={skillsHeadingId} className="job-posting-analysis__heading">
          技術スタック
        </h4>
        {skills.length > 0 ? (
          <ul className="job-posting-analysis__skills">
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
