package com.joblens.auth.dto;

import com.joblens.auth.EmailNormalizer;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        String password
) {

    public LoginRequest {
        email = EmailNormalizer.normalize(email);
    }
}
