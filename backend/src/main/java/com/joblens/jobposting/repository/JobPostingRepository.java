package com.joblens.jobposting.repository;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;


public interface JobPostingRepository extends JpaRepository<JobPosting, Long>, JpaSpecificationExecutor<JobPosting> {
    // 応募状況ごとの求人数を1回の集計クエリで取得する。
    @Query("""
            select j.applicationStatus as applicationStatus, count(j) as postingCount
            from JobPosting j
            group by j.applicationStatus
            """)
    List<ApplicationStatusCount> countGroupedByApplicationStatus();

    // 集計に必要な応募状況と件数のみを受け取るProjection。
    interface ApplicationStatusCount {
        ApplicationStatus getApplicationStatus();
        long getPostingCount();
    }
}
