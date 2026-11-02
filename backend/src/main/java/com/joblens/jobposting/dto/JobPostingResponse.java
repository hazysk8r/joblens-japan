package com.joblens.jobposting.dto;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.domain.ApplicationStatus;

import java.time.Instant;
import java.time.LocalDate;
// エンティティをAPIからそのまま返さず、応答DTOに変換する
public record JobPostingResponse(
        Long id,
        String companyName,
        String title,
        String sourceUrl,
        String originalText,
        Integer salaryMin,
        Integer salaryMax,
        LocalDate applicationDeadline,
        Long version,
        Instant createdAt,
        ApplicationStatus applicationStatus
) {

    public static JobPostingResponse from(JobPosting jobPosting) {
        return new JobPostingResponse(
                jobPosting.getId(),
                jobPosting.getCompanyName(),
                jobPosting.getTitle(),
                jobPosting.getSourceUrl(),
                jobPosting.getOriginalText(),
                jobPosting.getSalaryMin(),
                jobPosting.getSalaryMax(),
                jobPosting.getApplicationDeadline(),
                jobPosting.getVersion(),
                jobPosting.getCreatedAt(),
                jobPosting.getApplicationStatus()
        );
    }
}