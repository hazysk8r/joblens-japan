package com.joblens.jobposting.analysis;

/**
 * 判定の根拠となった原文の行。
 *
 * @param section 行が属する区間の見出し。見出しより前の行では null。
 * @param text    原文の行(長い場合は省略記号付きで切り詰める)。
 */
public record AnalysisEvidence(String section, String text) {
}
