import type { FixedOvertimeStatus } from '../types/jobPosting';

/**
 * 固定残業代の判定の表示。詳細画面の分析と一覧のバッジで同じ言葉を使うため、ここにまとめる。
 * 同じ判定を画面ごとに違う言葉で呼ぶと、利用者が別の判定だと受け取ってしまうため。
 *
 * tone:
 * - warning: 注意が必要(あり・判定できず)
 * - neutral: 記載から判定できた「なし」。安心させる色にはしない(自動判定のため)。
 * - muted: 記載がない。「なし」と取り違えないよう、目立たせない。
 */
export type FixedOvertimeVerdict = {
  label: string;
  note: string | null;
  tone: 'warning' | 'neutral' | 'muted';
};

// 知らない判定(サーバーが新しい判定を返した場合など)はnullを返し、表示しない。
export function fixedOvertimeVerdict(
  status: FixedOvertimeStatus,
  hours: number | null,
): FixedOvertimeVerdict | null {
  switch (status) {
    case 'PRESENT':
      return {
        label: hours !== null ? `あり（月${hours}時間分）` : 'あり（時間数は特定できず）',
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
        tone: 'muted',
      };
    case 'UNDETERMINED':
      return {
        label: '判定できず',
        note: '残業代についての記載を解釈できないか、記載が矛盾しています。根拠の文を確認してください。',
        tone: 'warning',
      };
    default: {
      // 判定を追加したときに表示の追加漏れを型チェックで検出する。
      const unexpected: never = status;
      void unexpected;
      return null;
    }
  }
}
