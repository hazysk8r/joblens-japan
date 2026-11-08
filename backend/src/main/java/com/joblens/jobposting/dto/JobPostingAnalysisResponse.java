package com.joblens.jobposting.dto;

import com.joblens.jobposting.analysis.FixedOvertimeAnalysis;

import java.util.List;

/**
 * 求人票の分析結果。項目を増やすときはフィールドを追加する。
 *
 * @param fixedOvertime 固定残業代の判定。
 * @param skills        求人票に出てくる技術名(サイトが付け加えた他社の求人などは除く)。
 */
public record JobPostingAnalysisResponse(FixedOvertimeAnalysis fixedOvertime, List<String> skills) {
}
