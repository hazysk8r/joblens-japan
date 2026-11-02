package com.joblens.auth.dto;

import com.joblens.auth.EmailNormalizer;
import com.joblens.auth.validation.MaxUtf8Bytes;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(

        @NotBlank(message = "メールアドレスを入力してください。")
        @Email(message = "メールアドレスの形式が正しくありません。")
        @Size(max = 254, message = "メールアドレスは254文字以内で入力してください。")
        String email,

        // BCryptは72バイトまでしか扱えないため、文字数に加えてUTF-8のバイト数も制限する。
        @NotBlank(message = "パスワードを入力してください。")
        @Size(min = 8, max = 64, message = "パスワードは8文字以上64文字以下で入力してください。")
        @MaxUtf8Bytes(value = 72, message = "パスワードが長すぎます。日本語などは1文字を3バイトとして数え、最大72バイトまで入力できます。")
        String password
) {

    // 入力検証の前に正規化し、前後の空白や大文字の違いで別ユーザーとして扱わないようにする。
    public SignupRequest {
        email = EmailNormalizer.normalize(email);
    }
}
