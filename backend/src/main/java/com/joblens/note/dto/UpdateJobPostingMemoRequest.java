package com.joblens.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateJobPostingMemoRequest(

    @NotBlank(message = "メモを入力してください。")
    @Size(max = 250, message = "メモは250文字以内で入力してください。")
    String content

) {
  
}
