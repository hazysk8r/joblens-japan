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
            // HTTPSで公開する環境ではtrueにする。
            @Value("${SESSION_COOKIE_SECURE:false}") boolean secure
    ) {
        return serializer -> {
            serializer.setUseHttpOnlyCookie(true);
            serializer.setSameSite("Lax");
            serializer.setUseSecureCookie(secure);
        };
    }
}
