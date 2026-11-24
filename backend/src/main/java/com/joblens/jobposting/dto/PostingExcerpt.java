package com.joblens.jobposting.dto;

import java.util.Arrays;

/**
 * 一覧のカードに出す原文の要約を作る。
 *
 * <p>原文は最大2万文字だが、カードは100文字しか使わないため、一覧では原文の全体を返さずに要約だけを返す。
 * 検索語が原文の後ろのほうにある求人でも、なぜ見つかったのかが分かるよう、検索語の少し前から出す。
 *
 * <p>文字は、絵文字などを途中で切らないようコードポイントで数える。
 * 空白の扱いは、以前に画面で要約を作っていたときの正規表現(JavaScriptの\s)と同じにする。
 */
public final class PostingExcerpt {

    /** 要約の長さ(省略記号を除く)。 */
    static final int LENGTH = 100;
    /** 検索語の前に出す文字数。スマートフォンの幅でも、検索語が要約の1〜2行目に出るよう短くする。 */
    static final int CONTEXT_BEFORE = 20;
    /**
     * これより長い検索語は探さずに先頭から出す。探す手間は「原文の長さ×検索語の長さ」に比例し、
     * 一覧の取得にはリクエスト数の制限がないため、URLで長い検索語を送られても重くならないようにする。
     */
    static final int MAX_KEYWORD_LENGTH = 100;

    private static final String ELLIPSIS = "…";

    private PostingExcerpt() {
    }

    public static String of(String originalText, String keyword) {
        int[] text = collapseSpaces(originalText == null ? "" : originalText);
        int[] word = collapseSpaces(keyword == null ? "" : keyword);
        int found = word.length == 0 || word.length > MAX_KEYWORD_LENGTH ? -1 : indexOfIgnoreCase(text, word);

        if (found < 0) {
            return excerpt(text, 0);
        }
        // 検索語の少し前から出す。長い検索語でも途中で切れないよう、検索語の終わりまでを入れる。
        // 末尾の近くで見つかったときは、100文字になるよう前を広げる。
        int start = Math.max(found - CONTEXT_BEFORE, found + word.length - LENGTH);
        start = Math.max(0, Math.min(start, text.length - LENGTH));
        return excerpt(text, start);
    }

    private static String excerpt(int[] text, int start) {
        int end = Math.min(text.length, start + LENGTH);
        StringBuilder builder = new StringBuilder();
        if (start > 0) {
            builder.append(ELLIPSIS);
        }
        builder.append(new String(text, start, end - start));
        if (end < text.length) {
            builder.append(ELLIPSIS);
        }
        return builder.toString();
    }

    /** 続く空白を1つの空白にまとめ、前後の空白を除いたコードポイントの列にする。 */
    private static int[] collapseSpaces(String value) {
        int[] codePoints = value.codePoints().toArray();
        int[] result = new int[codePoints.length];
        int length = 0;
        boolean pendingSpace = false;
        for (int codePoint : codePoints) {
            if (isSpace(codePoint)) {
                pendingSpace = length > 0;
                continue;
            }
            if (pendingSpace) {
                result[length++] = ' ';
                pendingSpace = false;
            }
            result[length++] = codePoint;
        }
        return Arrays.copyOf(result, length);
    }

    /** JavaScriptの正規表現の\sと同じ空白。 */
    private static boolean isSpace(int codePoint) {
        return switch (codePoint) {
            case '\t', '\n', 0x0B, '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF -> true;
            default -> codePoint >= 0x2000 && codePoint <= 0x200A;
        };
    }

    /**
     * 大文字と小文字を区別せずに探す(データベースの検索と同じく)。
     * 文字ごとに小文字にして比べるため、小文字にすると文字数が変わる文字でも位置がずれない。
     */
    private static int indexOfIgnoreCase(int[] text, int[] word) {
        int[] lowerWord = Arrays.stream(word).map(Character::toLowerCase).toArray();
        for (int i = 0; i + lowerWord.length <= text.length; i++) {
            int j = 0;
            while (j < lowerWord.length && Character.toLowerCase(text[i + j]) == lowerWord[j]) {
                j++;
            }
            if (j == lowerWord.length) {
                return i;
            }
        }
        return -1;
    }
}
