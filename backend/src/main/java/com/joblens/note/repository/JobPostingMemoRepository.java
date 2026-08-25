package com.joblens.note.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.joblens.note.domain.JobPostingMemo;

public interface JobPostingMemoRepository extends JpaRepository<JobPostingMemo, Long> {
  List<JobPostingMemo>
  findByJobPosting_Id(Long jobPostingId);
}
