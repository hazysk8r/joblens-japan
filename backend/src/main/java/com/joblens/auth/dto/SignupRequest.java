package com.joblens.auth.dto;

import com.joblens.auth.EmailNormalizer;
import com.joblens.auth.validation.MaxUtf8Bytes;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(

        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 254)
        String email,

        // BCryptは72バイトまでしか扱えないため、文字数に加えてUTF-8のバイト数も制限する。
        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, max = 64, message = "비밀번호는 8자 이상 64자 이하로 입력해주세요.")
        @MaxUtf8Bytes(value = 72, message = "비밀번호가 너무 깁니다. 한글 등은 1자를 3바이트로 계산하며, 최대 72바이트까지 입력할 수 있습니다.")
        String password
) {

    // 入力検証の前に正規化し、前後の空白や大文字の違いで別ユーザーとして扱わないようにする。
    public SignupRequest {
        email = EmailNormalizer.normalize(email);
    }
}
