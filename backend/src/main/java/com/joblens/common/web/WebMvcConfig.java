package com.joblens.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.RequiredArgsConstructor;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final ExpectedUserInterceptor expectedUserInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(expectedUserInterceptor)
                .addPathPatterns("/api/**")
                // ログイン・会員登録は、アカウントを切り替えるためのリクエストのため確認しない。
                // (ログアウトはSpring Securityのフィルターで処理され、ここには届かない。)
                // アカウントの削除は、別のユーザーのアカウントを削除しないよう確認する。
                .excludePathPatterns("/api/auth/login", "/api/auth/signup");
    }
}
