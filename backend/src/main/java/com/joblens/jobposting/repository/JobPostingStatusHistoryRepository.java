package com.joblens.jobposting.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.joblens.jobposting.domain.JobPostingStatusHistory;

public interface JobPostingStatusHistoryRepository extends JpaRepository<JobPostingStatusHistory, Long> {
  
}