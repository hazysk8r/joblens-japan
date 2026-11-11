package com.joblens.jobposting.analysis;

/**
 * 求人票の原文の1行。
 *
 * @param text  行の文字。根拠として表示するため、正規化せず元の文字のまま保持する(前後の空白だけ除く)。
 * @param start 原文の中での行の開始位置(UTF-16の単位)。画面で原文の該当箇所を示すために使う。
 */
public record SourceLine(String text, int start) {

    /** 原文の中での行の終了位置(この位置の文字は含まない)。 */
    public int end() {
        return start + text.length();
    }
}
