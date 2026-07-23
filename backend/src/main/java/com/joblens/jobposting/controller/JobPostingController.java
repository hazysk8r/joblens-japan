package com.joblens.jobposting.controller;

import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.service.JobPostingService;
import com.joblens.jobposting.dto.UpdateJobPostingRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
import java.util.List;

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

    @GetMapping
    public List<JobPostingResponse> findAll() {
        return jobPostingService.findAll();
    }

    @GetMapping("/{id}")
    public JobPostingResponse findById(@PathVariable Long id) {
        return jobPostingService.findById(id);
    }
}