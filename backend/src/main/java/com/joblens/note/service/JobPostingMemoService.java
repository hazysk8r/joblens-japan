package com.joblens.note.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.dto.JobPostingMemoResponse;
import com.joblens.note.dto.UpdateJobPostingMemoRequest;
import com.joblens.note.exception.JobPostingMemoNotFoundException;
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
    validateJobPostingExists(jobPostingId);

    List<JobPostingMemo> jobPostingMemos = jobPostingMemoRepository.findByJobPosting_IdOrderByUpdatedAtDescIdDesc(jobPostingId);

    // List 변환은 stream() 활용
    return jobPostingMemos.stream()
          .map(JobPostingMemoResponse::from)
          .toList();
  }

  @Transactional
  public void delete(Long jobPostingId, Long memoId) {
    JobPostingMemo jobPostingMemo = findMemo(jobPostingId, memoId);
    jobPostingMemoRepository.delete(jobPostingMemo);
  }

  @Transactional
  public JobPostingMemoResponse update(
    Long jobPostingId,
    Long memoId,
    UpdateJobPostingMemoRequest request) {
      JobPostingMemo jobPostingMemo = findMemo(jobPostingId, memoId);

      jobPostingMemo.update(
        request.content()
      );

      /*
       * Response生成前にupdatedAtの最新値を反映するため、
       * 明示的にflushする。
       */
      jobPostingMemoRepository.flush();

      return JobPostingMemoResponse.from(jobPostingMemo);
  }

  // 求人情報の存在確認のみが目的のため、エンティティを読み込まずに確認する。
  private void validateJobPostingExists(Long jobPostingId) {
    if (!jobPostingRepository.existsById(jobPostingId)) {
      throw new JobPostingNotFoundException(jobPostingId);
    }
  }

  // 求人情報が存在しない場合は404の求人エラーを優先し、その後にメモを取得する。
  private JobPostingMemo findMemo(Long jobPostingId, Long memoId) {
    validateJobPostingExists(jobPostingId);

    return jobPostingMemoRepository.findByIdAndJobPosting_Id(memoId, jobPostingId)
        .orElseThrow(() -> new JobPostingMemoNotFoundException(memoId, jobPostingId));
  }

}
