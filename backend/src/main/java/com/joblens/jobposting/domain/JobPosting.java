package com.joblens.jobposting.domain;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType; 
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;


@Entity
@Table(name = "job_postings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobPosting {
    // PostgreSQLのBIGSERIALを使用
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 所有者の確認にだけ使うため、Userエンティティとの関連ではなくIDで保持する。
    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "company_name", length = 200)
    private String companyName;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "source_url", columnDefinition = "TEXT")
    private String sourceUrl;

    @Column(name = "original_text", nullable = false, columnDefinition = "TEXT")
    private String originalText;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "application_status", nullable = false, length = 20)
    private ApplicationStatus applicationStatus = ApplicationStatus.SAVED;

    @Column(name = "salary_min")
    private Integer salaryMin;

    @Column(name = "salary_max")
    private Integer salaryMax;

    @Column(name = "application_deadline")
    private LocalDate applicationDeadline;

    @Version
    private Long version;

    public JobPosting(
            Long userId,
            String companyName,
            String title,
            String sourceUrl,
            String originalText,
            Integer salaryMin,
            Integer salaryMax,
            LocalDate applicationDeadline
    ) {
        this.userId = userId;
        this.companyName = companyName;
        this.title = title;
        this.sourceUrl = sourceUrl;
        this.originalText = originalText;
        this.salaryMin = salaryMin;
        this.salaryMax = salaryMax;
        this.applicationDeadline = applicationDeadline;
    }

     /**
    * 求人の内容を変更する。
    *
    * エンティティの各フィールドにpublicのsetterを用意せず、
    * 外部のコードが状態を勝手に変更できないようにする。
    * 意味が明確なドメインメソッドを通じてのみ状態を変更する。
    */
    public void update(
            String companyName,
            String title,
            String sourceUrl,
            String originalText,
            Integer salaryMin,
            Integer salaryMax,
            LocalDate applicationDeadline
    ) {
        this.companyName = companyName;
        this.title = title;
        this.sourceUrl = sourceUrl;
        this.originalText = originalText;
        this.salaryMin = salaryMin;
        this.salaryMax = salaryMax;
        this.applicationDeadline = applicationDeadline;
    }   

    public void changeApplicationStatus(
        ApplicationStatus applicationStatus
    ) {
        this.applicationStatus = applicationStatus;
    }
}