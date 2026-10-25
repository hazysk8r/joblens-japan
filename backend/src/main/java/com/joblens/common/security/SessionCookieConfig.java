package com.joblens.common.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * セッションCookieのセキュリティ属性を明示的に設定する。
 *
 * Spring Bootは起動方式(組み込みサーバー・WAR・テスト用のモック環境)によって
 * Cookie設定の参照先が変わり、テスト環境ではHttpOnlyやSameSiteが付かなかった。
 * 起動方式に関係なく同じ属性になるよう、ここで固定する。
 */
@Configuration
public class SessionCookieConfig {

    @Bean
    DefaultCookieSerializerCustomizer sessionCookieSecurityCustomizer(
            // 設定し忘れても安全側になるよう、既定でSecureを付ける。
            // HTTPで動かすローカル開発環境でのみ、明示的にfalseを指定する。
            // (HTTPSの自動判定に任せると、プロキシの後ろでは常にHTTPと判断されてSecureが付かない場合がある。)
            @Value("${SESSION_COOKIE_SECURE:true}") boolean secure
    ) {
        return serializer -> {
            serializer.setUseHttpOnlyCookie(true);
            serializer.setSameSite("Lax");
            serializer.setUseSecureCookie(secure);
        };
    }
}
