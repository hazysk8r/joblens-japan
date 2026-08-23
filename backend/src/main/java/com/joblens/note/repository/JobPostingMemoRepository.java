package com.joblens.note.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.joblens.note.domain.JobPostingMemo;

public interface JobPostingMemoRepository extends JpaRepository<JobPostingMemo, Long> {

};
