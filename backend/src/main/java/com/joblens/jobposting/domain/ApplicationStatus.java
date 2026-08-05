package com.joblens.jobposting.domain;

public enum ApplicationStatus {
  
  // 관심 공고 저장 상태
  SAVED,

  // 실제 지원 완료 상태
  APPLIED,

  // 면접 진행 중인 상태
  INTERVIEWING,

  // 합격 또는 오퍼를 받은 상태
  OFFERED,

  // 불합격한 상태
  REJECTED

}
