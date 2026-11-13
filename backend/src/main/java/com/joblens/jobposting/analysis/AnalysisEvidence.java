package com.joblens.jobposting.analysis;

/**
 * 判定の根拠となった原文の行。
 *
 * @param section 行が属する区間の見出し。見出しより前の行では null。
 * @param text    原文の行(長い場合は省略記号付きで切り詰める)。
 * @param start   原文の中での行の開始位置(UTF-16の単位)。
 * @param end     原文の中での行の終了位置。切り詰める前の行全体の終わりを指す。
 */
public record AnalysisEvidence(String section, String text, int start, int end) {

    private static final int MAX_TEXT_LENGTH = 200;

    /** 行から根拠を作る。文は長ければ切り詰め、位置は行全体を指す。 */
    public static AnalysisEvidence of(String section, SourceLine line) {
        return new AnalysisEvidence(section, truncate(line.text()), line.start(), line.end());
    }

    /** 絵文字などのサロゲートペアを途中で切らないよう、コードポイントの数で切り詰める。 */
    static String truncate(String text) {
        if (text.codePointCount(0, text.length()) <= MAX_TEXT_LENGTH) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, MAX_TEXT_LENGTH)) + "…";
    }
}
