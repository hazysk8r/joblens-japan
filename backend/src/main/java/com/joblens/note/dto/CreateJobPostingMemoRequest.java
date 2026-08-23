package com.joblens.note.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateJobPostingMemoRequest(

    @NotBlank(message = "메모를 입력해주세요")
    @Size(max = 250, message = "메모는 250자 이하로 작성해주세요")
    String content
) {

}