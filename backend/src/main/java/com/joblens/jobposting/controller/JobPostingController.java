package com.joblens.jobposting.controller;

import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.service.JobPostingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @GetMapping
    public List<JobPostingResponse> findAll() {
        return jobPostingService.findAll();
    }

    @GetMapping("/{id}")
    public JobPostingResponse findById(@PathVariable Long id) {
        return jobPostingService.findById(id);
    }
}