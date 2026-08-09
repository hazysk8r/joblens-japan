package com.joblens.jobposting.specification;

import org.springframework.data.jpa.domain.Specification;

import com.joblens.jobposting.domain.ApplicationStatus;
import com.joblens.jobposting.domain.JobPosting;

import jakarta.persistence.criteria.Predicate;


public class JobPostingSpecifications {
  // status 필터링
  public static Specification<JobPosting> hasStatus(ApplicationStatus applicationStatus) {
    if (applicationStatus == null) {
      return Specification.unrestricted();
    }

    return (root, query, cb) -> 
      cb.equal(root.get("applicationStatus"), applicationStatus);
  }

  private static String escapeLikeKeyword(String keyword) {
    return keyword
        .replace("!", "!!")
        .replace("%", "!%")
        .replace("_", "!_");
  }

  // keyword 필터링
  public static Specification<JobPosting> hasKeyword(String keyword) {
    if (keyword == null) {
      return Specification.unrestricted();
    }

    return (root, query, cb) -> {
      String escapedKeyword = escapeLikeKeyword(keyword.toLowerCase());
      String pattern = "%" + escapedKeyword + "%";

      Predicate titleLike = cb.like(cb.lower(root.get("title")), pattern, '!');
      Predicate companyNameLike = cb.like(cb.lower(root.get("companyName")), pattern, '!');
      Predicate originalTextLike = cb.like(cb.lower(root.get("originalText")), pattern, '!');

      return cb.or(titleLike, companyNameLike, originalTextLike);
    };
  }
}
