package com.joblens.jobposting.analysis;

import java.util.List;

/**
 * 見出しで区切った求人票の区間。
 *
 * @param heading 正規化した見出し。最初の見出しより前の部分では null。
 * @param lines   区間の行。
 */
public record PostingSection(String heading, List<SourceLine> lines) {

    public PostingSection {
        lines = List.copyOf(lines);
    }
}
