package com.joblens.jobposting.dto;

import com.joblens.jobposting.domain.JobPosting;

import java.time.Instant;
//엔티티를 API에서 그대로 반환하지 않고 응답 DTO로 변환
public record JobPostingResponse(
        Long id,
        String companyName,
        String title,
        String sourceUrl,
        String originalText,
        Instant createdAt
) {

    public static JobPostingResponse from(JobPosting jobPosting) {
        return new JobPostingResponse(
                jobPosting.getId(),
                jobPosting.getCompanyName(),
                jobPosting.getTitle(),
                jobPosting.getSourceUrl(),
                jobPosting.getOriginalText(),
                jobPosting.getCreatedAt()
        );
    }
}