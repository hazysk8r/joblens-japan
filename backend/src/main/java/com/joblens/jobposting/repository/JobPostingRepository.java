package com.joblens.jobposting.repository;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;


/*
 * 求人情報は必ず所有者(userId)で絞り込んで取得する。
 * JpaRepositoryが提供するfindById・existsById・findAllは所有者を確認しないため、
 * サービスからは使用しないこと。
 */
public interface JobPostingRepository extends JpaRepository<JobPosting, Long>, JpaSpecificationExecutor<JobPosting> {

    Optional<JobPosting> findByIdAndUserId(Long id, Long userId);

    boolean existsByIdAndUserId(Long id, Long userId);

    // 応募状況ごとの求人数を1回の集計クエリで取得する。
    @Query("""
            select j.applicationStatus as applicationStatus, count(j) as postingCount
            from JobPosting j
            where j.userId = :userId
            group by j.applicationStatus
            """)
    List<ApplicationStatusCount> countGroupedByApplicationStatus(@Param("userId") Long userId);

    // 集計に必要な応募状況と件数のみを受け取るProjection。
    interface ApplicationStatusCount {
        ApplicationStatus getApplicationStatus();
        long getPostingCount();
    }
}
