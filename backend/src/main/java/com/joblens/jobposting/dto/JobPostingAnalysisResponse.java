package com.joblens.jobposting.dto;

import com.joblens.jobposting.analysis.FixedOvertimeAnalysis;
import com.joblens.jobposting.analysis.SkillAnalysis;

import java.util.List;

/**
 * 求人票の分析結果。項目を増やすときはフィールドを追加する。
 *
 * @param fixedOvertime 固定残業代の判定。
 * @param skills        技術ごとの必須・歓迎の判定(サイトが付け加えた他社の求人などは除く)。
 */
public record JobPostingAnalysisResponse(FixedOvertimeAnalysis fixedOvertime, List<SkillAnalysis> skills) {
}
