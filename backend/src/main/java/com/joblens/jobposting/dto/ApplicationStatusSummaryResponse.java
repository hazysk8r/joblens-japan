package com.joblens.jobposting.dto;

public record ApplicationStatusSummaryResponse (

    long saved,
    long applied,
    long interviewing,
    long offered,
    long rejected
) {
  
}
  
