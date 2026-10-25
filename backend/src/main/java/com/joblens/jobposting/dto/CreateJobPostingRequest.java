package com.joblens.jobposting.dto;

import java.time.LocalDate;

import com.joblens.jobposting.validation.SalaryRangeTarget;
import com.joblens.jobposting.validation.ValidSalaryRange;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

//record는 요청·응답처럼 값 전달이 목적인 객체에 적합
@ValidSalaryRange
public record CreateJobPostingRequest(

        @Size(max = 200)
        String companyName,

        @NotBlank(message = "공고 제목은 필수입니다.")
        @Size(max = 200)
        String title,

        // 一般的なブラウザ・サーバーが扱えるURLの長さに合わせる。
        @Size(max = 2048)
        String sourceUrl,

        // 求人原文として十分な長さを確保しつつ、極端に大きなデータの保存を防ぐ。
        @NotBlank(message = "공고 원문은 필수입니다.")
        @Size(max = 20000)
        String originalText,

        @PositiveOrZero
        Integer salaryMin,

        @PositiveOrZero 
        Integer salaryMax,

        LocalDate applicationDeadline
        
) implements SalaryRangeTarget{
}