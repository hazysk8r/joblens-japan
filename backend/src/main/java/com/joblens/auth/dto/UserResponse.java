package com.joblens.auth.dto;

import com.joblens.auth.security.AuthenticatedUser;

// パスワードのハッシュはレスポンスに含めない。
public record UserResponse(
        Long id,
        String email
) {

    public static UserResponse from(AuthenticatedUser user) {
        return new UserResponse(user.getId(), user.getEmail());
    }
}
