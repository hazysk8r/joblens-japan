package com.joblens.jobposting.analysis;

import java.util.List;

/**
 * 見出しで区切った求人票の区間。
 *
 * @param heading     正規化した見出し。最初の見出しより前の部分では null。
 * @param lines       区間の行。
 * @param headingLine 見出しの元の文字と原文での位置。【Java経験者歓迎】のように見出しにも技術名が書かれるため、
 *                    根拠として示すのに使う。最初の見出しより前の部分では null。
 */
public record PostingSection(String heading, List<SourceLine> lines, SourceLine headingLine) {

    public PostingSection {
        lines = List.copyOf(lines);
    }
}
