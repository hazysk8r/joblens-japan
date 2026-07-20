package com.joblens.jobposting.service;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.dto.CreateJobPostingRequest;
import com.joblens.jobposting.dto.JobPostingResponse;
import com.joblens.jobposting.repository.JobPostingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingService {

    private final JobPostingRepository jobPostingRepository;

    @Transactional
    public JobPostingResponse create(CreateJobPostingRequest request) {
        JobPosting jobPosting = new JobPosting(
                request.companyName(),
                request.title(),
                request.sourceUrl(),
                request.originalText()
        );

        JobPosting savedJobPosting = jobPostingRepository.save(jobPosting);

        return JobPostingResponse.from(savedJobPosting);
    }

    public List<JobPostingResponse> findAll() {
        return jobPostingRepository.findAll()
                .stream()
                .map(JobPostingResponse::from)
                .toList();
    }

    public JobPostingResponse findById(Long id) {
        JobPosting jobPosting = jobPostingRepository.findById(id)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "채용공고를 찾을 수 없습니다. id=" + id
                        )
                );

        return JobPostingResponse.from(jobPosting);
    }
}