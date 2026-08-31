package com.joblens.note.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.exception.JobPostingMemoNotFoundException;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.dto.JobPostingMemoResponse;
import com.joblens.note.dto.UpdateJobPostingMemoRequest;
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

  public List<JobPostingMemoResponse> getMemos(Long jobPostingId) {

    jobPostingRepository.findById(jobPostingId)
        .orElseThrow(() -> new JobPostingNotFoundException(jobPostingId));

    List<JobPostingMemo> jobPostingMemos = jobPostingMemoRepository.findByJobPosting_IdOrderByUpdatedAtDescIdDesc(jobPostingId);
    
    // List 변환은 stream() 활용
    return jobPostingMemos.stream()
          .map(JobPostingMemoResponse::from)
          .toList();
  }

  @Transactional
  public void delete(Long jobPostingId, Long memoId) {
    jobPostingRepository.findById(jobPostingId)
        .orElseThrow(() -> new JobPostingNotFoundException(jobPostingId));

    JobPostingMemo jobPostingMemo = jobPostingMemoRepository.findByIdAndJobPosting_Id(memoId, jobPostingId)
        .orElseThrow(() -> new JobPostingMemoNotFoundException(memoId, jobPostingId));
    jobPostingMemoRepository.delete(jobPostingMemo);
  }

  @Transactional
  public JobPostingMemoResponse update(
    Long jobPostingId, 
    Long memoId, 
    UpdateJobPostingMemoRequest request) {
      jobPostingRepository.findById(jobPostingId)
        .orElseThrow(() -> new JobPostingNotFoundException(jobPostingId));

      JobPostingMemo jobPostingMemo = jobPostingMemoRepository.findByIdAndJobPosting_Id(memoId, jobPostingId)
        .orElseThrow(() -> new JobPostingMemoNotFoundException(memoId, jobPostingId));

      jobPostingMemo.update(
        request.content()
      );

      return JobPostingMemoResponse.from(jobPostingMemo);
  }

}
