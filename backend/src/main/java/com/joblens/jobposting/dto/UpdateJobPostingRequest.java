package com.joblens.jobposting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 채용공고 수정 요청을 전달하는 DTO다.
 *
 * 생성 요청과 현재 필드가 같더라도 별도의 DTO로 분리한다.
 * 나중에 생성과 수정의 검증 규칙이 달라질 수 있기 때문
 */
public record UpdateJobPostingRequest(

        @Size(max = 200)
        String companyName,

        @NotBlank(message = "공고 제목은 필수입니다.")
        @Size(max = 200)
        String title,

        String sourceUrl,

        @NotBlank(message = "공고 원문은 필수입니다.")
        String originalText
) {
}