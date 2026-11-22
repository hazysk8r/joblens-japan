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

function overlaps(a: EvidenceRange, b: EvidenceRange): boolean {
  return a.start < b.end && b.start < a.end;
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
    if (accepted.some((range) => overlaps(item, range))) {
      return null;
    }
    const range = { start: item.start, end: item.end };
    accepted.push(range);
    return range;
  });
}

/** 選んだ根拠を、すでに強調している根拠と合わせてどう示すか。 */
export type SelectedEvidencePlacement =
  // 強調している根拠のうち、この番号のものと同じ行。
  | { kind: 'existing'; index: number }
  // 強調している根拠と重ならない行。この範囲を新しく強調する。
  | { kind: 'added'; range: EvidenceRange }
  // 原文と一致しない、または強調している根拠と一部だけ重なるため示せない。
  | null;

/**
 * 技術の根拠のように、選んだときだけ強調する根拠の示し方を決める。
 * 一部だけ重なる行を強調すると、境目が分からず、どちらの判定の根拠か読み取れなくなるため示さない。
 */
export function placeSelectedEvidence(
  originalText: string,
  ranges: (EvidenceRange | null)[],
  item: AnalysisEvidence,
): SelectedEvidencePlacement {
  if (!matchesOriginalText(originalText, item)) {
    return null;
  }
  const same = ranges.findIndex((range) => range !== null && range.start === item.start && range.end === item.end);
  if (same >= 0) {
    return { kind: 'existing', index: same };
  }
  if (ranges.some((range) => range !== null && overlaps(item, range))) {
    return null;
  }
  return { kind: 'added', range: { start: item.start, end: item.end } };
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
