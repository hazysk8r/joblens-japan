package com.joblens.note.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.joblens.note.domain.JobPostingMemo;

public interface JobPostingMemoRepository extends JpaRepository<JobPostingMemo, Long> {
  List<JobPostingMemo>
    findByJobPosting_IdOrderByUpdatedAtDescIdDesc(Long jobPostingId);

  // Optional 사용 이유: memoId + jobPostingId 조합이 존재하지 않을 가능성이 있기 때문 + 단건 조회
  Optional<JobPostingMemo> findByIdAndJobPosting_Id(Long memoId, Long jobPostingId);
}
