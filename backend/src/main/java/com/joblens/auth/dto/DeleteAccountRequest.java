package com.joblens.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// 上限はログインと同じにする。
public record DeleteAccountRequest(

        @NotBlank(message = "パスワードを入力してください。")
        @Size(max = 64, message = "パスワードは64文字以内で入力してください。")
        String password
) {
}
