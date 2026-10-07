package com.joblens.jobposting.domain;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity 
@Table(name = "job_posting_status_histories")
@Getter 
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobPostingStatusHistory {
  
  @Id 
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(
    name = "job_posting_id",
    nullable = false
  )
  private JobPosting jobPosting;

  @Enumerated(EnumType.STRING)
  @Column(name = "from_status", nullable = false, length = 20)
  private ApplicationStatus fromStatus;

  @Enumerated(EnumType.STRING)
  @Column(name = "to_status", nullable = false, length = 20)
  private ApplicationStatus toStatus;

  @CreationTimestamp
  @Column(name = "changed_at", nullable = false)
  private Instant changedAt;

  public JobPostingStatusHistory(
    JobPosting jobPosting,
    ApplicationStatus fromStatus,
    ApplicationStatus toStatus
  ) {
    this.jobPosting = jobPosting;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}
