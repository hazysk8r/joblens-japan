package com.joblens.jobposting.dto;

import java.time.LocalDate;

import com.joblens.jobposting.validation.SalaryRangeTarget;
import com.joblens.jobposting.validation.ValidHttpUrl;
import com.joblens.jobposting.validation.ValidSalaryRange;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

// recordはリクエスト・応答のように値の受け渡しが目的のオブジェクトに適している
@ValidSalaryRange
public record CreateJobPostingRequest(

        @Size(max = 200, message = "会社名は200文字以内で入力してください。")
        String companyName,

        @NotBlank(message = "求人タイトルは必須です。")
        @Size(max = 200, message = "求人タイトルは200文字以内で入力してください。")
        String title,

        // 一般的なブラウザ・サーバーが扱えるURLの長さに合わせる。
        @Size(max = 2048, message = "求人URLは2048文字以内で入力してください。")
        @ValidHttpUrl
        String sourceUrl,

        // 求人原文として十分な長さを確保しつつ、極端に大きなデータの保存を防ぐ。
        @NotBlank(message = "求人原文は必須です。")
        @Size(max = 20000, message = "求人原文は20000文字以内で入力してください。")
        String originalText,

        @PositiveOrZero(message = "最低月給は0以上で入力してください。")
        Integer salaryMin,

        @PositiveOrZero(message = "最高月給は0以上で入力してください。")
        Integer salaryMax,

        LocalDate applicationDeadline
        
) implements SalaryRangeTarget{
}