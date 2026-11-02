package com.joblens.jobposting.dto;

import com.joblens.jobposting.domain.ApplicationStatus;

import jakarta.validation.constraints.NotNull;

public record UpdateApplicationStatusRequest(

  @NotNull(message = "応募ステータスを指定してください。")
  ApplicationStatus status

) {
} 
