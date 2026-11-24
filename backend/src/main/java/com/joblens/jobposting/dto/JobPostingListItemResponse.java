package com.joblens.jobposting.dto;

import com.joblens.jobposting.analysis.FixedOvertimeSummary;
import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;

import java.time.Instant;
import java.time.LocalDate;

/**
 * 一覧の求人。詳細と同じ項目に、一覧のバッジに使う固定残業代の判定を加える。
 * 原文は最大2万文字で、カードは100文字しか使わないため、原文の全体ではなく要約を返す。
 *
 * @param excerpt       カードに出す原文の要約。検索語が原文にあれば、その少し前から出す。
 * @param fixedOvertime 固定残業代の判定。分析に失敗した求人では null(一覧全体は返すため)。
 */
public record JobPostingListItemResponse(
        Long id,
        String companyName,
        String title,
        String sourceUrl,
        String excerpt,
        Integer salaryMin,
        Integer salaryMax,
        LocalDate applicationDeadline,
        Long version,
        Instant createdAt,
        ApplicationStatus applicationStatus,
        FixedOvertimeSummary fixedOvertime
) {

    public static JobPostingListItemResponse from(
            JobPosting jobPosting, String keyword, FixedOvertimeSummary fixedOvertime) {
        return new JobPostingListItemResponse(
                jobPosting.getId(),
                jobPosting.getCompanyName(),
                jobPosting.getTitle(),
                jobPosting.getSourceUrl(),
                PostingExcerpt.of(jobPosting.getOriginalText(), keyword),
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
