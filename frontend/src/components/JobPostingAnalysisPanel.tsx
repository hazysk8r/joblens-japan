import { useId } from 'react';

import type {
  AnalysisEvidence,
  JobPostingAnalysis,
  SkillAnalysis,
  SkillLevel,
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

// 判定ごとの欄。表示のない判定を「必須」「歓迎」と読まれないよう、欄の名前で何を意味するかを書く。
const SKILL_GROUPS: { level: SkillLevel; label: string }[] = [
  { level: 'REQUIRED', label: '必須' },
  { level: 'PREFERRED', label: '歓迎' },
  { level: 'IN_REQUIREMENTS', label: '応募資格に記載（必須・歓迎の記載なし）' },
  { level: 'UNDETERMINED', label: '判定できず（記載が矛盾しています）' },
  { level: 'MENTIONED', label: 'その他の記載（業務内容・開発環境など）' },
];

type SkillItem = { key: string; label: string; evidence: AnalysisEvidence[] };

/**
 * 「いずれか」の技術を、根拠の文に書かれた順に並べる。根拠と見比べやすくするため。
 * 文の中に見つからない名前(全角や別の書き方)は、元の順のまま後ろに置く。
 */
function inTextOrder(names: string[], text: string): string[] {
  const lower = text.toLowerCase();
  const positionOf = (name: string) => {
    const index = lower.indexOf(name.toLowerCase());
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...names].sort((a, b) => positionOf(a) - positionOf(b));
}

/**
 * 欄に並べる項目。「いずれか」の技術は、全部が必要だと読まれないよう「Java・Pythonのいずれか」の1項目にまとめる。
 */
function skillItemsOf(skills: SkillAnalysis[], level: SkillLevel): SkillItem[] {
  const items: SkillItem[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    if (skill.level !== level) {
      continue;
    }
    const names = inTextOrder([skill.name, ...skill.alternatives], skill.evidence[0]?.text ?? '');
    const key = [...names].sort().join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({
      key,
      label: names.length > 1 ? `${names.join('・')}のいずれか` : skill.name,
      evidence: skill.evidence,
    });
  }
  return items;
}

function SkillGroups({ skills }: { skills: SkillAnalysis[] }) {
  const idPrefix = useId();
  // 知らない判定(サーバーが新しい判定を返した場合など)の技術は表示しない。
  const groups = SKILL_GROUPS
    .map((group) => ({ ...group, items: skillItemsOf(skills, group.level) }))
    .filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return <p>抽出された技術スタックはありません。</p>;
  }

  return (
    <>
      {groups.map((group) => {
        const labelId = `${idPrefix}-${group.level}`;
        return (
          <div key={group.level} className="job-posting-analysis__skill-group">
            <p id={labelId} className="job-posting-analysis__skill-label">{group.label}</p>
            <ul aria-labelledby={labelId} className="job-posting-analysis__skills">
              {group.items.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
          </div>
        );
      })}
      {/* 根拠を最初から全部出すと長くなるため、開いたときに見せる。 */}
      <details className="job-posting-analysis__skill-evidence">
        <summary>判定の根拠を見る</summary>
        <ul>
          {groups.flatMap((group) => group.items).map((item) => (
            <li key={item.key}>
              <span className="job-posting-analysis__skill-name">{item.label}</span>
              {item.evidence.map((line, index) => (
                <span key={index} className="job-posting-analysis__skill-line">
                  {line.section !== null && (
                    <span className="job-posting-analysis__evidence-section">{line.section}</span>
                  )}
                  {line.text}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </>
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
        <SkillGroups skills={skills} />
        <p className="job-posting-analysis__note">辞書にある技術名だけを表示します。</p>
      </section>

      <p className="job-posting-analysis__disclaimer">
        自動判定のため、誤りがある可能性があります。
      </p>
    </div>
  );
}
