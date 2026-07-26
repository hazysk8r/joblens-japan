package com.joblens.jobposting.controller;

import com.joblens.common.response.PageResponse;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.service.JobPostingService;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.net.URI;

@RestController
@RequestMapping("/api/job-postings")
@RequiredArgsConstructor
public class JobPostingController {

    private final JobPostingService jobPostingService;

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
     * 채용공고 전체 내용을 수정한다.
     *
     * PUT은 대상 리소스의 현재 내용을 요청 본문의 내용으로
     * 교체한다는 의미로 사용한다.
     */
    @PutMapping("/{id}")
    public JobPostingResponse update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateJobPostingRequest request
    ) {
        return jobPostingService.update(id, request);
    }

    /**
     * 채용공고를 삭제한다.
     *
     * 삭제 성공 후 반환할 데이터가 없으므로
     * HTTP 204 No Content를 반환한다.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        jobPostingService.delete(id);

        return ResponseEntity.noContent().build();
    }

    /**
     * 채용공고를 검색하고 페이지 단위로 반환한다.
     *
     * 요청 예시:
     * GET /api/job-postings?keyword=AWS&page=0&size=10&sort=id,desc
     */
    @GetMapping
    public PageResponse<JobPostingResponse> findAll(
            @RequestParam(required = false) String keyword,

            /*
            * page나 size를 생략했을 때 사용할 기본값이다.
            * 기본적으로 한 페이지에 10개씩 최신 공고부터 반환한다.
            */
            @PageableDefault(
                    size = 10,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            )
            Pageable pageable
    ) {
        return jobPostingService.findAll(keyword, pageable);
    }

    @GetMapping("/{id}")
    public JobPostingResponse findById(@PathVariable Long id) {
        return jobPostingService.findById(id);
    }
}