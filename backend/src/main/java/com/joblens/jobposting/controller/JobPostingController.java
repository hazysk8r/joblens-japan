package com.joblens.jobposting.controller;

import com.joblens.auth.security.AuthenticatedUser;
import com.joblens.common.response.PageResponse;
import com.joblens.jobposting.dto.ApplicationStatusSummaryResponse;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingAnalysisResponse;
import com.joblens.jobposting.dto.JobPostingDeadlineFilterRequest;
import com.joblens.jobposting.dto.JobPostingListItemResponse;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.dto.JobPostingSalaryFilterRequest;
import com.joblens.jobposting.dto.JobPostingStatusHistoryResponse;
import com.joblens.jobposting.service.JobPostingService;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.common.web.IfMatchHeader;
import com.joblens.jobposting.domain.ApplicationStatus;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/job-postings")
@RequiredArgsConstructor
public class JobPostingController {

    private final JobPostingService jobPostingService;

    @PostMapping
    public ResponseEntity<JobPostingResponse> create(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody CreateJobPostingRequest request
    ) {
        JobPostingResponse response = jobPostingService.create(user.getId(), request);

        return ResponseEntity
                .created(URI.create("/api/job-postings/" + response.id()))
                .body(response);
    }

    /**
     * 求人情報全体を修正する。
     *
     * PUTは対象リソースの現在の内容を、
     * リクエスト本文の内容で置き換えるために使用する。
     */
    @PutMapping("/{id}")
    public ResponseEntity<JobPostingResponse> update(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @RequestHeader(value="If-Match", required = false) String ifMatch,
            @Valid @RequestBody UpdateJobPostingRequest request
    ) {
        Long expectedVersion = IfMatchHeader.parse(ifMatch);
        JobPostingResponse response = jobPostingService.update(user.getId(), id, expectedVersion, request);

        return okWithETag(response);
    }

    /**
     * 求人情報を削除する。
     *
     * 削除成功時はレスポンスボティを含めず、
     * HTTP 204 No Contentを返却する。
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        jobPostingService.delete(user.getId(), id);

        return ResponseEntity.noContent().build();
    }

    /**
     * 求人情報を検索し、ページングされた結果を返却する。
     *
     * リクエスト例：
     * GET /api/job-postings?keyword=AWS&page=0&size=10&sort=createdAt,desc
     */
    @GetMapping
    public PageResponse<JobPostingListItemResponse> findAll(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) String keyword,

            /*
             * pageやsizeを省略した場合に使用するデフォルト値で、
             * 1ページあたり10件ずつ、最新の求人情報から返却する。
             */
            @PageableDefault(
                    size = 10,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            )
            Pageable pageable,

            @RequestParam(name = "status", required = false) ApplicationStatus applicationStatus,

            /*
             * salaryMin / salaryMaxを検索条件DTOにバインドし、
             * ＠Validを用いて負の値および
             * salaryMin > salaryMaxとなる不正な範囲を検証する。
             */
            @Valid @ModelAttribute JobPostingSalaryFilterRequest salaryFilter,

            @Valid @ModelAttribute JobPostingDeadlineFilterRequest deadlineFilter
    ) {
        return jobPostingService.findAll(user.getId(), keyword, pageable, applicationStatus, salaryFilter.salaryMin(), 
                salaryFilter.salaryMax(), deadlineFilter.deadlineFrom(), deadlineFilter.deadlineTo());
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobPostingResponse> findById(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        JobPostingResponse response = jobPostingService.findById(user.getId(), id);

        return okWithETag(response);
    }

    // ETagヘッダーをレスポンスに含めるため、ResponseEntityに変更した。
    @PatchMapping("/{id}/status")
    public ResponseEntity<JobPostingResponse> updateApplicationResponse(
        @AuthenticationPrincipal AuthenticatedUser user,
        @PathVariable Long id,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @Valid @RequestBody UpdateApplicationStatusRequest request
    ) {
        Long expectedVersion = IfMatchHeader.parse(ifMatch);
        JobPostingResponse response = jobPostingService.updateApplicationStatus(user.getId(), id, expectedVersion, request);

        return okWithETag(response);
    }

    private ResponseEntity<JobPostingResponse> okWithETag(JobPostingResponse response) {
        return ResponseEntity
                .ok()
                .eTag(String.valueOf(response.version()))
                .body(response);
    }

    @GetMapping("/status-summary")
    public ApplicationStatusSummaryResponse getApplicationStatusSummaryResponse(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return jobPostingService.getApplicationStatusSummary(user.getId());
    }
    
    @GetMapping("/{id}/analysis")
    public JobPostingAnalysisResponse analyze(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
    ) {
        return jobPostingService.analyze(user.getId(), id);
    }

    @GetMapping("/{id}/status-history")
    public ResponseEntity<List<JobPostingStatusHistoryResponse>> 
        getApplicationStatusHistory(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id
        ) {
            return ResponseEntity.ok(jobPostingService.getApplicationStatusHistory(user.getId(), id)
        );
    }
    
    

}
