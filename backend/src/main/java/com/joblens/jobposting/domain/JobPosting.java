package com.joblens.jobposting.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType; 
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "job_postings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobPosting {
    //PostgreSQL의 BIGSERIAL 사용
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_name", length = 200)
    private String companyName;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "source_url", columnDefinition = "TEXT")
    private String sourceUrl;

    @Column(name = "original_text", nullable = false, columnDefinition = "TEXT")
    private String originalText;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "application_status", nullable = false, length = 20)
    private ApplicationStatus applicationStatus = ApplicationStatus.SAVED;

    public JobPosting(
            String companyName,
            String title,
            String sourceUrl,
            String originalText
    ) {
        this.companyName = companyName;
        this.title = title;
        this.sourceUrl = sourceUrl;
        this.originalText = originalText;
        this.createdAt = Instant.now();
    }

     /**
    * 채용공고의 내용을 변경한다.
    *
    * 엔티티의 각 필드에 public setter를 제공하지 않아,
    * 외부 코드가 상태를 임의로 변경하지 못하게 한다.
    * 의미가 명확한 도메인 메서드를 통해서만 상태를 변경한다.
    */
    public void update(
            String companyName,
            String title,
            String sourceUrl,
            String originalText
    ) {
        this.companyName = companyName;
        this.title = title;
        this.sourceUrl = sourceUrl;
        this.originalText = originalText;
    }   

    public void changeApplicationStatus(
        ApplicationStatus applicationStatus
    ) {
        this.applicationStatus = applicationStatus;
    }
}