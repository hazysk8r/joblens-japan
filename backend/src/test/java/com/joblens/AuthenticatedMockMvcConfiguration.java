package com.joblens;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.joblens.auth.repository.UserRepository;

/**
 * 認証以外の機能を検証する既存のAPIテスト用の設定。
 *
 * MockMvcのすべてのリクエストに、DBに登録済みのテストユーザー(TestUsers#defaultUser)としての
 * ログイン状態とCSRFトークンを既定で付与する。テストで作成する求人の所有者もこのユーザーにすること。
 * 認証や所有者の分離そのものを検証するテストでは、この設定をImportしないこと。
 */
@TestConfiguration(proxyBeanMethods = false)
public class AuthenticatedMockMvcConfiguration {

    @Bean
    TestUsers testUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return new TestUsers(userRepository, passwordEncoder);
    }

    @Bean
    MockMvcBuilderCustomizer authenticatedRequestCustomizer(TestUsers testUsers) {
        return builder -> builder.defaultRequest(get("/")
                .with(user(testUsers.defaultUser()))
                .with(csrf()));
    }
}
