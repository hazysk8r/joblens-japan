package com.joblens.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateJobPostingMemoRequest(

    @NotBlank
    @Size(max = 250)
    String content

) {
  
}
