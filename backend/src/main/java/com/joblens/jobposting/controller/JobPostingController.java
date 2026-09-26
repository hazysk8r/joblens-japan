package com.joblens.jobposting.controller;

import com.joblens.common.response.PageResponse;
import com.joblens.jobposting.dto.ApplicationStatusSummaryResponse;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.dto.JobPostingSalaryFilterRequest;
import com.joblens.jobposting.service.JobPostingService;
import com.joblens.jobposting.dto.UpdateApplicationStatusRequest;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import com.joblens.jobposting.exception.IfMatchRequiredException;
import com.joblens.jobposting.exception.MalformedIfMatchHeaderException;
import com.joblens.jobposting.domain.ApplicationStatus;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
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
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/job-postings")
@RequiredArgsConstructor
public class JobPostingController {

    private final JobPostingService jobPostingService;
    // 数値のみを含む強いETag形式を許可する
    private static final Pattern IF_MATCH_PATTERN = Pattern.compile("^\"\\d+\"$");

    @PostMapping
    public ResponseEntity<JobPostingResponse> create(
            @Valid @RequestBody CreateJobPostingRequest request
    ) {
        JobPostingResponse response = jobPostingService.create(request);

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
            @PathVariable Long id,
            @RequestHeader(value="If-Match", required = false) String ifMatch,
            @Valid @RequestBody UpdateJobPostingRequest request
    ) {
        Long expectedVersion = parseIfMatch(ifMatch);
        JobPostingResponse response = jobPostingService.update(id, expectedVersion, request);

        return okWithETag(response);
    }

    /**
     * 求人情報を削除する。
     *
     * 削除成功時はレスポンスボティを含めず、
     * HTTP 204 No Contentを返却する。
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        jobPostingService.delete(id);

        return ResponseEntity.noContent().build();
    }

    /**
     * 求人情報を検索し、ページングされた結果を返却する。
     *
     * リクエスト例：
     * GET /api/job-postings?keyword=AWS&page=0&size=10&sort=createdAt,desc
     */
    @GetMapping
    public PageResponse<JobPostingResponse> findAll(
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
            @Valid @ModelAttribute JobPostingSalaryFilterRequest salaryFilter
    ) {
        return jobPostingService.findAll(keyword, pageable, applicationStatus, salaryFilter.salaryMin(), 
                salaryFilter.salaryMax());
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobPostingResponse> findById(@PathVariable Long id) {
        JobPostingResponse response = jobPostingService.findById(id);

        return okWithETag(response);
    }

    // ETagヘッダーをレスポンスに含めるため、ResponseEntityに変更した。
    @PatchMapping("/{id}/status")
    public ResponseEntity<JobPostingResponse> updateApplicationResponse(
        @PathVariable Long id,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @Valid @RequestBody UpdateApplicationStatusRequest request
    ) {
        Long expectedVersion = parseIfMatch(ifMatch);
        JobPostingResponse response = jobPostingService.updateApplicationStatus(id, expectedVersion, request);

        return okWithETag(response);
    }

    private Long parseIfMatch(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new IfMatchRequiredException();
        }

        if (!IF_MATCH_PATTERN.matcher(ifMatch).matches()) {
            throw new MalformedIfMatchHeaderException(ifMatch);
        }

        String version = ifMatch.substring(1, ifMatch.length() - 1);
        // 数値形式は正しくてもLongの範囲を超える場合は不正なIf-Matchとして扱う
        try {
            return Long.valueOf(version);
        } catch (NumberFormatException exception) {
            throw new MalformedIfMatchHeaderException(ifMatch);
        }
    }

    private ResponseEntity<JobPostingResponse> okWithETag(JobPostingResponse response) {
        return ResponseEntity
                .ok()
                .eTag(String.valueOf(response.version()))
                .body(response);
    }

    @GetMapping("/status-summary")
    public ApplicationStatusSummaryResponse getApplicationStatusSummaryResponse(
    ) {
        return jobPostingService.getApplicationStatusSummary();
    }
    
    @GetMapping("/{id}/skills")
    public List<String> getExtractedSkills(@PathVariable Long id) {
        return jobPostingService.extractSkills(id);
    }
    

}
