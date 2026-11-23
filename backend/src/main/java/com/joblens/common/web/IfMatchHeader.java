package com.joblens.common.web;

import java.util.regex.Pattern;

/**
 * 同時編集による上書きを防ぐためのIf-Matchヘッダーを、期待するバージョンとして読む。
 * 求人とメモで同じ規則を使う。
 */
public final class IfMatchHeader {

    // 数値のみを含む強いETag形式を許可する
    private static final Pattern IF_MATCH_PATTERN = Pattern.compile("^\"\\d+\"$");

    private IfMatchHeader() {
    }

    /**
     * ヘッダーがなければ428、形式が正しくなければ400の例外にする。
     */
    public static Long parse(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new IfMatchRequiredException();
        }

        if (!IF_MATCH_PATTERN.matcher(ifMatch).matches()) {
            throw new MalformedIfMatchHeaderException(ifMatch);
        }

        String version = ifMatch.substring(1, ifMatch.length() - 1);
        // 数値形式は正しくてもLongの範囲を超える場合は不正なIf-Matchとして扱う
        try {
            return Long.valueOf(version);
        } catch (NumberFormatException exception) {
            throw new MalformedIfMatchHeaderException(ifMatch);
        }
    }
}
