package com.joblens.jobposting.dto;

import com.joblens.jobposting.analysis.FixedOvertimeSummary;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;

import java.time.Instant;
import java.time.LocalDate;

/**
 * 一覧の求人。詳細と同じ項目に、一覧のバッジに使う固定残業代の判定を加える。
 *
 * @param fixedOvertime 固定残業代の判定。分析に失敗した求人では null(一覧全体は返すため)。
 */
public record JobPostingListItemResponse(
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
        ApplicationStatus applicationStatus,
        FixedOvertimeSummary fixedOvertime
) {

    public static JobPostingListItemResponse from(JobPosting jobPosting, FixedOvertimeSummary fixedOvertime) {
        return new JobPostingListItemResponse(
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
                jobPosting.getApplicationStatus(),
                fixedOvertime
        );
    }
}
