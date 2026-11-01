package com.joblens.jobposting.validation;

import java.util.List;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/*
 * java.net.URIは使わない。「?q=a|b」を拒否し、「日本語.jp」や「my_company.example.com」のhostをnullにするため、
 * ブラウザで開ける実際の求人URLを誤って拒否してしまう。
 * 正規表現も使わない。@Sizeで拒否される値もここを通るため、入力は本文の上限(1MB)まで長くなり得る。
 */
public class HttpUrlValidator implements ConstraintValidator<ValidHttpUrl, String> {

    private static final List<String> ALLOWED_PREFIXES = List.of("http://", "https://");

    // ホストの先頭に来ない文字。ブラウザは「\」を「/」として解釈する。
    private static final String NOT_HOST_START = "/?#\\";

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        // 未入力は許可する(任意の項目)。
        if (value == null) {
            return true;
        }

        int hostStart = hostStartOf(value);
        if (hostStart < 0 || hostStart >= value.length()
                || NOT_HOST_START.indexOf(value.charAt(hostStart)) >= 0) {
            return false;
        }

        // ブラウザはタブ・改行を取り除いてからURLを解釈するため、残しておくと判定と実際の動作がずれる。
        return value.codePoints().noneMatch(HttpUrlValidator::isSpaceOrControl);
    }

    private static int hostStartOf(String value) {
        for (String prefix : ALLOWED_PREFIXES) {
            if (value.regionMatches(true, 0, prefix, 0, prefix.length())) {
                return prefix.length();
            }
        }
        return -1;
    }

    private static boolean isSpaceOrControl(int codePoint) {
        return Character.isSpaceChar(codePoint) || Character.isISOControl(codePoint);
    }
}
