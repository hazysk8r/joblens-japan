package com.joblens.note.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.dto.JobPostingMemoResponse;
import com.joblens.note.repository.JobPostingMemoRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingMemoService {
  private final JobPostingMemoRepository jobPostingMemoRepository;
  private final JobPostingRepository jobPostingRepository;

  @Transactional
  public JobPostingMemoResponse create(Long jobPostingId, CreateJobPostingMemoRequest request) {
    JobPosting jobPosting = jobPostingRepository.findById(jobPostingId)
    .orElseThrow(() -> new JobPostingNotFoundException(jobPostingId));

    JobPostingMemo jobPostingMemo = new JobPostingMemo(
      request.content(),
      jobPosting
    );

    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(jobPostingMemo);

    return JobPostingMemoResponse.from(savedJobPostingMemo);
  }

}
