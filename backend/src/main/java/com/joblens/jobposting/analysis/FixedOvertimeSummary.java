package com.joblens.jobposting.analysis;

/**
 * 一覧のバッジに使う固定残業代の判定。根拠の文は詳細画面で確認するため含めない。
 *
 * @param status 判定結果。
 * @param hours  固定残業の時間数。PRESENT で時間数を一つに特定できた場合だけ値を持つ。
 */
public record FixedOvertimeSummary(FixedOvertimeStatus status, Integer hours) {

    public static FixedOvertimeSummary from(FixedOvertimeAnalysis analysis) {
        return new FixedOvertimeSummary(analysis.status(), analysis.hours());
    }
}
