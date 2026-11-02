package com.joblens.jobposting.domain;

public enum ApplicationStatus {
  
  // 気になる求人を保存した状態
  SAVED,

  // 実際に応募した状態
  APPLIED,

  // 面接が進行中の状態
  INTERVIEWING,

  // 合格または内定を受けた状態
  OFFERED,

  // 不合格の状態
  REJECTED

}
