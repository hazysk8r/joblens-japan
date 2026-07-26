package com.joblens.jobposting.repository;

import com.joblens.jobposting.domain.JobPosting;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobPostingRepository extends JpaRepository<JobPosting, Long> {
    /**
     * 제목, 회사명, 공고 원문 중 하나라도 키워드를 포함하면 조회한다.
     *
     * Containing은 SQL의 LIKE '%키워드%'에 해당하고,
     * IgnoreCase는 영문 대소문자를 구분하지 않게 한다.
     */
    Page<JobPosting>
    findByTitleContainingIgnoreCaseOrCompanyNameContainingIgnoreCaseOrOriginalTextContainingIgnoreCase(
            String titleKeyword,
            String companyNameKeyword,
            String originalTextKeyword,
            Pageable pageable
    );
}