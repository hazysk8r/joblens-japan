package com.joblens.auth.dto;

import com.joblens.auth.EmailNormalizer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/*
 * 上限はSignupRequestと同じにする。
 * 会員登録より小さくすると、登録できたのにログインできないユーザーが生まれる。
 */
public record LoginRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        @Size(max = 254, message = "メールアドレスは254文字以内で入力してください。")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(max = 64, message = "パスワードは64文字以内で入力してください。")
        String password
) {

    public LoginRequest {
        email = EmailNormalizer.normalize(email);
    }
}
