package com.joblens.note.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.joblens.note.domain.JobPostingMemo;

public interface JobPostingMemoRepository extends JpaRepository<JobPostingMemo, Long> {
  List<JobPostingMemo>
    findByJobPosting_IdOrderByUpdatedAtDescIdDesc(Long jobPostingId);

  // Optionalを使う理由: memoIdとjobPostingIdの組み合わせが存在しない可能性があり、単件取得でもあるため
  Optional<JobPostingMemo> findByIdAndJobPosting_Id(Long memoId, Long jobPostingId);
}
