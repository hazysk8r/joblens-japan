package com.joblens.jobposting.analysis;

import java.util.List;

/**
 * 固定残業代の分析結果。
 *
 * @param status          判定結果。
 * @param hours           固定残業の時間数。PRESENT で時間数を一つに特定できた場合だけ値を持つ。
 * @param excessPayStated 固定残業時間を超えた分の支給が明記されているか。PRESENT 以外では null。
 * @param evidence        判定の根拠となった行。
 */
public record FixedOvertimeAnalysis(
        FixedOvertimeStatus status,
        Integer hours,
        Boolean excessPayStated,
        List<AnalysisEvidence> evidence) {

    public FixedOvertimeAnalysis {
        evidence = List.copyOf(evidence);
    }
}
