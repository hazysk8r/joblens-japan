package com.joblens.auth;

import java.util.Locale;

// 会員登録・ログイン・ユーザー検索で同じ規則を使うため、正規化処理を1か所にまとめる。
public final class EmailNormalizer {

    private EmailNormalizer() {
    }

    public static String normalize(String email) {
        if (email == null) {
            return null;
        }
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
