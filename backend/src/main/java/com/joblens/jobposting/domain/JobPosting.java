package com.joblens.jobposting.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
}