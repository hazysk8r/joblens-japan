package com.joblens.jobposting.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.joblens.jobposting.domain.JobPostingStatusHistory;

public interface JobPostingStatusHistoryRepository extends JpaRepository<JobPostingStatusHistory, Long> {
  List<JobPostingStatusHistory> 
    findByJobPosting_IdOrderByChangedAtDescIdDesc(Long jobPostingId);

  /**
   * 求人の変更履歴のうち、新しい順でkeep件より後のものを削除する。
   * 順序は画面に表示する一覧と同じ。
   */
  @Modifying
  @Query(value = """
      DELETE FROM job_posting_status_histories
      WHERE job_posting_id = :jobPostingId
        AND id NOT IN (
          SELECT id FROM job_posting_status_histories
          WHERE job_posting_id = :jobPostingId
          ORDER BY changed_at DESC, id DESC
          LIMIT :keep
        )
      """, nativeQuery = true)
  int deleteAllExceptLatest(@Param("jobPostingId") Long jobPostingId, @Param("keep") int keep);
}