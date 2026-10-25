package com.joblens.jobposting.dto;

import java.time.LocalDate;

import com.joblens.jobposting.validation.SalaryRangeTarget;
import com.joblens.jobposting.validation.ValidSalaryRange;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * 채용공고 수정 요청을 전달하는 DTO다.
 *
 * 생성 요청과 현재 필드가 같더라도 별도의 DTO로 분리한다.
 * 나중에 생성과 수정의 검증 규칙이 달라질 수 있기 때문
 */
@ValidSalaryRange
public record UpdateJobPostingRequest(

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