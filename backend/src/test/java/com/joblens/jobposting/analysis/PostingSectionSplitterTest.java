package com.joblens.jobposting.analysis;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PostingSectionSplitterTest {

    /** 見出しと行の文字だけを比べるための形。位置は別のテストで確かめる。 */
    private record Section(String heading, List<String> lines) {
    }

    private static List<Section> texts(List<PostingSection> sections) {
        return sections.stream()
                .map(section -> new Section(section.heading(),
                        section.lines().stream().map(SourceLine::text).toList()))
                .toList();
    }

    private static List<SourceLine> lines(List<PostingSection> sections) {
        return sections.stream().flatMap(section -> section.lines().stream()).toList();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "給与\n固定残業代45時間分",
            "給与\r\n\r\n固定残業代45時間分\r\n超過分は別途支給",
            "給与\r固定残業代45時間分",
            "給与\u2028固定残業代45時間分\u2029超過分は別途支給\u0085賞与",
            "給与\n　 固定残業代45時間分\t　\n",
            "【給与】　固定残業代45時間分を含む\n【勤務地】\n東京都",
            "😀給与\n😀固定残業代45時間分😀\n𠮷野家",
    })
    void 各行の原文での位置を持ち_その位置で原文を切り出すと行の文字になる(String originalText) {
        List<SourceLine> lines = lines(PostingSectionSplitter.split(originalText));

        assertThat(lines).isNotEmpty().allSatisfy(line ->
                assertThat(originalText.substring(line.start(), line.end())).isEqualTo(line.text()));
    }

    @Test
    void 同じ文の行もそれぞれの位置を持ち_見出しの後ろの文は見出しの後ろの位置になる() {
        List<SourceLine> lines = lines(PostingSectionSplitter.split(
                "固定残業代あり\r\n  固定残業代あり\n【給与】 月給30万円"));

        assertThat(lines).containsExactly(
                new SourceLine("固定残業代あり", 0),
                new SourceLine("固定残業代あり", 11),
                new SourceLine("月給30万円", 24));
    }

    @Test
    void 辞書にある見出しの行で区間を分け_見出しより前は見出しなしの区間にする() {
        List<PostingSection> sections = PostingSectionSplitter.split("""
                バックエンドエンジニア
                給与
                月給30万円
                勤務地
                東京都
                """);

        assertThat(texts(sections)).containsExactly(
                new Section(null, List.of("バックエンドエンジニア")),
                new Section("給与", List.of("月給30万円")),
                new Section("勤務地", List.of("東京都")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"給与：", "給与:", "　給与　", "給与 ： "})
    void 前後の空白と末尾のコロンを除いて見出しと判定する(String headingLine) {
        List<PostingSection> sections = PostingSectionSplitter.split(headingLine + "\n月給30万円");

        assertThat(texts(sections)).containsExactly(new Section("給与", List.of("月給30万円")));
    }

    @Test
    void 隅付き括弧の見出しは括弧の後ろの文を区間の最初の行にする() {
        List<PostingSection> sections = PostingSectionSplitter.split("""
                【給与】月給30万円（固定残業代を含む）
                賞与年2回
                【勤務地】
                東京都
                """);

        assertThat(texts(sections)).containsExactly(
                new Section("給与", List.of("月給30万円（固定残業代を含む）", "賞与年2回")),
                new Section("勤務地", List.of("東京都")));
    }

    @Test
    void 文の一部に見出しの語があっても見出しにしない() {
        List<PostingSection> sections = PostingSectionSplitter.split("""
                給与は面談で決定します
                ■給与
                """);

        assertThat(texts(sections)).containsExactly(
                new Section(null, List.of("給与は面談で決定します", "■給与")));
    }

    @Test
    void 行は元の文字のまま保持し_空行を除き_前後の空白を取る() {
        List<PostingSection> sections = PostingSectionSplitter.split(
                "給与\r\n\r\n  固定残業代４５時間分  \r\n\t\n月給３０万円");

        assertThat(texts(sections)).containsExactly(
                new Section("給与", List.of("固定残業代４５時間分", "月給３０万円")));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "この企業が募集中のほかの求人",
            "閲覧・気になる・応募した求人に近い求人のうちまだ見ていない求人",
            "この求人に似た求人を探す",
            "類似の職種カテゴリー",
            "近くの類似の求人",
            "企業情報と給与情報",
            "キャリアガイドの記事"
    })
    void サイトが付け加えた文の目印の行から後ろを除く(String marker) {
        List<PostingSection> sections = PostingSectionSplitter.split("""
                給与
                月給30万円
                %s
                給与
                固定残業代30時間分を含む
                """.formatted(marker));

        assertThat(texts(sections)).containsExactly(new Section("給与", List.of("月給30万円")));
    }

    @Test
    void 目印の語を含むだけの行では除かない() {
        List<PostingSection> sections = PostingSectionSplitter.split("""
                この企業が募集中のほかの求人もご覧ください
                月給30万円
                """);

        assertThat(texts(sections)).containsExactly(new Section(null,
                List.of("この企業が募集中のほかの求人もご覧ください", "月給30万円")));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\r\n"})
    void 原文が空なら区間はない(String originalText) {
        assertThat(texts(PostingSectionSplitter.split(originalText))).isEmpty();
    }
}
