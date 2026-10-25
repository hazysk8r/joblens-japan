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
                // ログイン・会員登録・ログアウトは、アカウントを切り替えるためのリクエストのため確認しない。
                .excludePathPatterns("/api/auth/**");
    }
}
