package com.joblens;

import org.springframework.security.crypto.password.PasswordEncoder;

import com.joblens.auth.domain.User;
import com.joblens.auth.repository.UserRepository;
import com.joblens.auth.security.AuthenticatedUser;

/**
 * テストで求人の所有者として使うユーザーをDBに用意する。
 *
 * 既定のユーザーはBean生成時に作成しておく。リクエストごとに検索すると、
 * 実行されたSQLの数を検証するテストに影響するため。
 */
public class TestUsers {

    public static final String DEFAULT_EMAIL = "test-user@example.com";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticatedUser defaultUser;

    public TestUsers(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.defaultUser = findOrCreate(DEFAULT_EMAIL);
    }

    public AuthenticatedUser defaultUser() {
        return defaultUser;
    }

    public Long defaultUserId() {
        return defaultUser.getId();
    }

    public AuthenticatedUser findOrCreate(String email) {
        User user = userRepository.findByEmail(email)
                .orElseGet(() -> userRepository.save(new User(email, passwordEncoder.encode("password123"))));
        return AuthenticatedUser.from(user);
    }
}
