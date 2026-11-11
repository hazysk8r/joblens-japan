import type { AnalysisEvidence } from '../types/jobPosting';

/**
 * 分析の根拠を、詳細画面の原文の中で示すための計算。
 *
 * 根拠の位置(start, end)はサーバーが原文から計算する。JavaとJSは同じ単位(UTF-16)で文字列の位置を数えるため、
 * そのまま使える。ただし、別の画面で原文を変えた直後などは、分析した原文と表示中の原文が違うことがある。
 * 違う行を強調すると判定を誤解させるため、表示中の原文のその位置が根拠の文と一致するときだけ使う。
 */

export type EvidenceRange = { start: number; end: number };

export type OriginalTextSegment = {
  text: string;
  // 根拠の番号。根拠でない部分はnull。
  evidenceIndex: number | null;
};

// サーバーは長い行を「…」付きで切り詰めて返す。位置は切り詰める前の行全体を指す。
const TRUNCATION_MARK = '…';

function matchesOriginalText(originalText: string, item: AnalysisEvidence): boolean {
  const { start, end, text } = item;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > originalText.length) {
    return false;
  }

  const line = originalText.slice(start, end);
  if (line === text) {
    return true;
  }

  // 切り詰めた文なら、前半が一致し、原文の行のほうが長いことを確かめる。
  const prefix = text.endsWith(TRUNCATION_MARK) ? text.slice(0, -TRUNCATION_MARK.length) : null;
  return prefix !== null && prefix.length > 0 && line.length > prefix.length && line.startsWith(prefix);
}

/**
 * 根拠ごとに、原文の中の範囲を返す。原文と一致しない根拠と、前の根拠と重なる根拠はnullにする。
 */
export function locateEvidence(originalText: string, evidence: AnalysisEvidence[]): (EvidenceRange | null)[] {
  const accepted: EvidenceRange[] = [];

  return evidence.map((item) => {
    if (!matchesOriginalText(originalText, item)) {
      return null;
    }
    const overlaps = accepted.some((range) => item.start < range.end && range.start < item.end);
    if (overlaps) {
      return null;
    }
    const range = { start: item.start, end: item.end };
    accepted.push(range);
    return range;
  });
}

/**
 * 原文を、根拠の部分とそれ以外の部分に分ける。つなげると元の原文と同じ文字列になる。
 */
export function segmentsOf(originalText: string, ranges: (EvidenceRange | null)[]): OriginalTextSegment[] {
  const located = ranges
    .map((range, evidenceIndex) => (range === null ? null : { ...range, evidenceIndex }))
    .filter((range) => range !== null)
    .sort((a, b) => a.start - b.start);

  const segments: OriginalTextSegment[] = [];
  let position = 0;
  for (const { start, end, evidenceIndex } of located) {
    if (position < start) {
      segments.push({ text: originalText.slice(position, start), evidenceIndex: null });
    }
    segments.push({ text: originalText.slice(start, end), evidenceIndex });
    position = end;
  }
  if (position < originalText.length) {
    segments.push({ text: originalText.slice(position), evidenceIndex: null });
  }
  return segments;
}
