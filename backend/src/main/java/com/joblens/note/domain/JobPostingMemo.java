package com.joblens.note.domain;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.joblens.jobposting.domain.JobPosting;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name="job_posting_memos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JobPostingMemo {
  //BigSerial 사용
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name="content", length = 250, nullable = false)
  private String content;

  @CreationTimestamp
  @Column(name="created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @UpdateTimestamp
  @Column(name="updated_at", nullable = false)
  private Instant updatedAt;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name="job_posting_id", nullable = false)
  private JobPosting jobPosting;

  public JobPostingMemo(
    String content,
    JobPosting jobPosting
  ) {
    this.content = content;
    this.jobPosting = jobPosting;
  }

}
