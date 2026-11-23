package com.joblens.note.service;

import java.util.List;
import java.util.Objects;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.joblens.auth.exception.UserNoLongerExistsException;
import com.joblens.auth.repository.UserRepository;
import com.joblens.common.limit.UsageLimits;
import com.joblens.jobposting.domain.JobPosting;
import com.joblens.jobposting.exception.JobPostingNotFoundException;
import com.joblens.jobposting.repository.JobPostingRepository;
import com.joblens.note.domain.JobPostingMemo;
import com.joblens.note.dto.CreateJobPostingMemoRequest;
import com.joblens.note.dto.JobPostingMemoResponse;
import com.joblens.note.dto.UpdateJobPostingMemoRequest;
import com.joblens.note.exception.JobPostingMemoNotFoundException;
import com.joblens.note.exception.JobPostingMemoVersionConflictException;
import com.joblens.note.exception.MemoLimitReachedException;
import com.joblens.note.repository.JobPostingMemoRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JobPostingMemoService {
  private final JobPostingMemoRepository jobPostingMemoRepository;
  private final JobPostingRepository jobPostingRepository;
  private final UserRepository userRepository;
  private final UsageLimits usageLimits;

  @Transactional
  public JobPostingMemoResponse create(Long userId, Long jobPostingId, CreateJobPostingMemoRequest request) {
    // 件数の確認と保存の間に同じユーザーの別の登録が入ると、上限を超えてしまう。
    userRepository.findLockedById(userId).orElseThrow(UserNoLongerExistsException::new);

    JobPosting jobPosting = jobPostingRepository.findByIdAndUserId(jobPostingId, userId)
    .orElseThrow(() -> new JobPostingNotFoundException(jobPostingId));

    if (jobPostingMemoRepository.countByJobPosting_Id(jobPostingId) >= usageLimits.maxMemosPerPosting()) {
      throw new MemoLimitReachedException(usageLimits.maxMemosPerPosting());
    }

    JobPostingMemo jobPostingMemo = new JobPostingMemo(
      request.content(),
      jobPosting
    );

    JobPostingMemo savedJobPostingMemo = jobPostingMemoRepository.save(jobPostingMemo);

    return JobPostingMemoResponse.from(savedJobPostingMemo);
  }

  public List<JobPostingMemoResponse> getMemos(Long userId, Long jobPostingId) {
    validateJobPostingExists(userId, jobPostingId);

    List<JobPostingMemo> jobPostingMemos = jobPostingMemoRepository.findByJobPosting_IdOrderByUpdatedAtDescIdDesc(jobPostingId);

    // Listへの変換はstream()を活用
    return jobPostingMemos.stream()
          .map(JobPostingMemoResponse::from)
          .toList();
  }

  @Transactional
  public void delete(Long userId, Long jobPostingId, Long memoId) {
    JobPostingMemo jobPostingMemo = findMemo(userId, jobPostingId, memoId);
    jobPostingMemoRepository.delete(jobPostingMemo);
  }

  @Transactional
  public JobPostingMemoResponse update(
    Long userId,
    Long jobPostingId,
    Long memoId,
    Long expectedVersion,
    UpdateJobPostingMemoRequest request) {
      // 所有者の確認(404)をversionの確認(412)より先に行い、他人のメモの存在やversionを漏らさない。
      JobPostingMemo jobPostingMemo = findMemo(userId, jobPostingId, memoId);
      if (!Objects.equals(expectedVersion, jobPostingMemo.getVersion())) {
        throw new JobPostingMemoVersionConflictException(memoId, expectedVersion, jobPostingMemo.getVersion());
      }

      jobPostingMemo.update(
        request.content()
      );

      /*
       * Response生成前にupdatedAtとversionの最新値を反映するため、
       * 明示的にflushする。確認と保存の間に別の保存が入った競合も、ここで検出する。
       */
      try {
        jobPostingMemoRepository.flush();
      } catch (OptimisticLockingFailureException exception) {
        throw new JobPostingMemoVersionConflictException(memoId, exception);
      }

      return JobPostingMemoResponse.from(jobPostingMemo);
  }

  // 求人情報の存在と所有者の確認のみが目的のため、エンティティを読み込まずに確認する。
  private void validateJobPostingExists(Long userId, Long jobPostingId) {
    if (!jobPostingRepository.existsByIdAndUserId(jobPostingId, userId)) {
      throw new JobPostingNotFoundException(jobPostingId);
    }
  }

  /*
   * メモは求人を通して所有者が決まるため、2段階で確認する。
   * 1. 求人がログイン中のユーザーのものか(違えば404の求人エラー)
   * 2. メモがその求人に属しているか(違えば404のメモエラー)
   */
  private JobPostingMemo findMemo(Long userId, Long jobPostingId, Long memoId) {
    validateJobPostingExists(userId, jobPostingId);

    return jobPostingMemoRepository.findByIdAndJobPosting_Id(memoId, jobPostingId)
        .orElseThrow(() -> new JobPostingMemoNotFoundException(memoId, jobPostingId));
  }

}
