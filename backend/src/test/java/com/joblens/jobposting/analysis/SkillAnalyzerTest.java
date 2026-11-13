package com.joblens.jobposting.analysis;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static com.joblens.jobposting.analysis.SkillLevel.IN_REQUIREMENTS;
import static com.joblens.jobposting.analysis.SkillLevel.MENTIONED;
import static com.joblens.jobposting.analysis.SkillLevel.PREFERRED;
import static com.joblens.jobposting.analysis.SkillLevel.REQUIRED;
import static com.joblens.jobposting.analysis.SkillLevel.UNDETERMINED;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * 技術の必須・歓迎の判定。判定を誤らないことが最も大切なため、表現ごとに判定を表で確かめる。
 * 「必須」「歓迎」は求人票にその表示があるときだけ付け、表示がなければ書かれた場所だけを示す。
 */
class SkillAnalyzerTest {

    private static List<SkillAnalysis> analyze(String originalText) {
        return SkillAnalyzer.analyze(PostingSectionSplitter.split(originalText));
    }

    /** 技術名と判定。「いずれか」は判定の後ろに「/いずれか:ほかの技術」を付ける。 */
    private static Map<String, String> judgements(String originalText) {
        Map<String, String> result = new LinkedHashMap<>();
        for (SkillAnalysis skill : analyze(originalText)) {
            String value = skill.level().name();
            if (!skill.alternatives().isEmpty()) {
                value += "/いずれか:" + String.join(",", skill.alternatives());
            }
            result.put(skill.name(), value);
        }
        return result;
    }

    private static Map<String, String> expect(Object... nameAndLevel) {
        Map<String, String> result = new LinkedHashMap<>();
        for (int i = 0; i < nameAndLevel.length; i += 2) {
            Object level = nameAndLevel[i + 1];
            result.put((String) nameAndLevel[i], level instanceof SkillLevel l ? l.name() : (String) level);
        }
        return result;
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("判定の表")
    void 表現ごとに判定する(String description, String originalText, Map<String, String> expected) {
        assertThat(judgements(originalText)).as(description).containsExactlyInAnyOrderEntriesOf(expected);
    }

    private static Stream<Arguments> 判定の表() {
        return Stream.of(
                // ---- 見出しによる既定の判定
                Arguments.of("必須の見出し", "必須条件\nJavaの実務経験", expect("Java", REQUIRED)),
                Arguments.of("必須スキル・条件の見出し", "必須スキル・条件\nJavaの実務経験", expect("Java", REQUIRED)),
                Arguments.of("歓迎の見出し", "歓迎スキル\nAWSの利用経験", expect("AWS", PREFERRED)),
                Arguments.of("歓迎する経験の見出し", "歓迎する経験\nAWSの利用経験", expect("AWS", PREFERRED)),
                Arguments.of("応募資格で表示なし", "応募資格\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("対象となる方で表示なし", "対象となる方\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("応募条件で表示なし", "応募条件\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("必要なスキルで表示なし", "必要なスキル\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("求めるスキルで表示なし", "求めるスキル\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("求める経験で表示なし", "求める経験\nJavaの実務経験", expect("Java", IN_REQUIREMENTS)),
                Arguments.of("求める人物像は要件ではない", "求める人物像\nJavaが好きな方", expect("Java", MENTIONED)),
                Arguments.of("仕事内容", "仕事内容\nJavaでの開発", expect("Java", MENTIONED)),
                Arguments.of("見出しより前", "Javaエンジニア募集", expect("Java", MENTIONED)),
                Arguments.of("開発環境の見出しで応募資格の判定を終える",
                        "応募資格\nJavaの実務経験\n開発環境\nAWS, Docker",
                        expect("Java", IN_REQUIREMENTS, "AWS", MENTIONED, "Docker", MENTIONED)),
                Arguments.of("使用技術の見出しで終える", "必須条件\nJava経験\n使用技術\nAWS",
                        expect("Java", REQUIRED, "AWS", MENTIONED)),
                Arguments.of("技術スタックの見出しで終える", "必須条件\nJava経験\n技術スタック\nAWS",
                        expect("Java", REQUIRED, "AWS", MENTIONED)),
                Arguments.of("開発言語の見出しで終える", "必須条件\nJava経験\n開発言語\nPython",
                        expect("Java", REQUIRED, "Python", MENTIONED)),

                // ---- 隅付き括弧の見出し
                Arguments.of("【必須】の後ろの文", "【必須】Javaの実務経験", expect("Java", REQUIRED)),
                Arguments.of("【歓迎】の下の行", "【歓迎】\nAWSの利用経験", expect("AWS", PREFERRED)),
                Arguments.of("【未経験歓迎】は宣伝の文で、下の行に判定を引き継がない",
                        "【未経験歓迎】\nJava研修あり\nPythonで開発します", expect("Java", MENTIONED, "Python", MENTIONED)),
                Arguments.of("【第二新卒歓迎】の後ろの文", "【第二新卒歓迎】Javaで開発します", expect("Java", MENTIONED)),
                Arguments.of("見出しの中の技術は見出しの表示で判定し、下の行には引き継がない",
                        "【Java経験者歓迎】\nPythonで開発します", expect("Java", PREFERRED, "Python", MENTIONED)),

                // ---- 表示の行
                Arguments.of("■必須の下の行", "応募資格\n■必須\nJava経験\n■歓迎\nAWS経験",
                        expect("Java", REQUIRED, "AWS", PREFERRED)),
                Arguments.of("＜必須＞と＜歓迎＞", "応募資格\n＜必須＞\nJava経験\n＜歓迎＞\nAWS経験",
                        expect("Java", REQUIRED, "AWS", PREFERRED)),
                Arguments.of("◆歓迎スキル", "仕事内容\nPythonで開発\n◆歓迎スキル\nAWS経験",
                        expect("Python", MENTIONED, "AWS", PREFERRED)),
                Arguments.of("[必須]と・必須条件:", "応募資格\n[必須]\nJava経験\n・必須条件:\nGo言語の経験",
                        expect("Java", REQUIRED, "Go", REQUIRED)),
                Arguments.of("表示の行の判定は次の見出しで終える", "応募資格\n■歓迎\nAWS経験\n仕事内容\nDocker",
                        expect("AWS", PREFERRED, "Docker", MENTIONED)),

                // ---- 1行の中の表示
                Arguments.of("前の表示が二つ", "応募資格\n必須：Java、歓迎：AWS",
                        expect("Java", REQUIRED, "AWS", PREFERRED)),
                Arguments.of("前の表示より前の技術には、その表示を付けない", "応募資格\nJava経験、必須：Python経験",
                        expect("Java", IN_REQUIREMENTS, "Python", REQUIRED)),
                Arguments.of("後ろの表示は句点より前の文に付けない", "応募資格\nJavaの実務経験。AWSの経験があれば尚可",
                        expect("Java", IN_REQUIREMENTS, "AWS", PREFERRED)),
                Arguments.of("後ろの表示が二つ", "応募資格\nJava経験必須、AWS経験あれば尚可",
                        expect("Java", REQUIRED, "AWS", PREFERRED)),
                Arguments.of("読点の一覧に後ろの表示", "応募資格\nJava、AWSの経験があれば尚可",
                        expect("Java", PREFERRED, "AWS", PREFERRED)),
                Arguments.of("括弧の中の尚可", "応募資格\nJavaの開発経験（AWSの経験があれば尚可）",
                        expect("Java", IN_REQUIREMENTS, "AWS", PREFERRED)),
                Arguments.of("前の表示は括弧の後ろにも続く", "必須：Java（3年以上）、Spring Boot",
                        expect("Java", REQUIRED, "Spring Boot", REQUIRED)),
                Arguments.of("優遇", "応募資格\nAWS資格をお持ちの方優遇", expect("AWS", PREFERRED)),
                Arguments.of("望ましい", "応募資格\nDockerの知識があると望ましい", expect("Docker", PREFERRED)),
                Arguments.of("要件の外でも表示があれば判定する", "開発環境\nJava（必須）、AWS（歓迎）",
                        expect("Java", REQUIRED, "AWS", PREFERRED)),

                // ---- 否定(表示より先に確かめる)
                Arguments.of("必須ではありません", "応募資格\nJava経験は必須ではありません", expect("Java", MENTIONED)),
                Arguments.of("必須ではない", "必須条件\nJava経験は必須ではない", expect("Java", MENTIONED)),
                Arguments.of("不問", "応募資格\nJava経験不問", expect("Java", MENTIONED)),
                Arguments.of("問いません", "応募資格\nJavaの経験は問いません", expect("Java", MENTIONED)),
                Arguments.of("不要", "応募資格\nAWSの知識は不要です", expect("AWS", MENTIONED)),
                Arguments.of("なくても可", "応募資格\nAWS経験がなくても可", expect("AWS", MENTIONED)),
                Arguments.of("未経験可", "応募資格\nJava未経験可", expect("Java", MENTIONED)),
                Arguments.of("未経験OK", "必須条件\nJava未経験OK", expect("Java", MENTIONED)),

                // ---- いずれか
                Arguments.of("いずれか", "必須条件\nJava、Python、Go言語いずれかの経験",
                        expect("Java", "REQUIRED/いずれか:Python,Go",
                                "Python", "REQUIRED/いずれか:Java,Go",
                                "Go", "REQUIRED/いずれか:Java,Python")),
                Arguments.of("または", "応募資格\nJavaまたはPythonの開発経験（AWSの経験があれば尚可）",
                        expect("Java", "IN_REQUIREMENTS/いずれか:Python",
                                "Python", "IN_REQUIREMENTS/いずれか:Java",
                                "AWS", PREFERRED)),
                Arguments.of("もしくは", "歓迎スキル\nAWSもしくはGCPの経験", expect(
                        "AWS", "PREFERRED/いずれか:GCP", "GCP", "PREFERRED/いずれか:AWS")),
                Arguments.of("いずれかと単独の必須があれば、単独の必須にする",
                        "必須条件\nJavaまたはPythonの経験\nJavaでの3年以上の経験",
                        expect("Java", REQUIRED, "Python", "REQUIRED/いずれか:Java")),

                // ---- 矛盾・優先順位
                Arguments.of("必須と不問が両方あれば判定できず", "必須条件\nJava経験\n応募資格\nJava経験不問",
                        expect("Java", UNDETERMINED)),
                Arguments.of("必須と歓迎があれば必須", "必須：Java\n歓迎：Javaで5年以上の経験", expect("Java", REQUIRED)),
                Arguments.of("歓迎と不問があれば歓迎", "歓迎スキル\nAWS経験\n応募資格\nAWS経験不問", expect("AWS", PREFERRED)),
                // 応募資格に書かれた技術を「歓迎」と示すと、必要な技術を不要と受け取らせてしまうため。
                Arguments.of("歓迎と応募資格(表示なし)があれば応募資格", "応募資格\nJava経験\n歓迎スキル\nJavaで5年以上の経験",
                        expect("Java", IN_REQUIREMENTS)),
                Arguments.of("歓迎の後に応募資格(表示なし)が書かれても応募資格", "歓迎スキル\nJavaで5年以上の経験\n応募資格\nJava経験",
                        expect("Java", IN_REQUIREMENTS)),
                Arguments.of("応募資格と仕事内容なら応募資格", "仕事内容\nJavaで開発\n応募資格\nJava経験",
                        expect("Java", IN_REQUIREMENTS)),

                // ---- 研修
                Arguments.of("研修の行は表示があっても要件にしない", "必須条件\n入社後はJava研修(必須)を受講します",
                        expect("Java", MENTIONED)),
                Arguments.of("研修で学べる", "応募資格\n研修でAWSを学べます", expect("AWS", MENTIONED)),

                // ---- 技術名の見つけ方
                Arguments.of("C社やCランクは技術名にしない", "応募資格\nC社での開発経験\nCランク以上", expect()),
                Arguments.of("C言語", "必須条件\nC言語の経験", expect("C", REQUIRED)),
                Arguments.of("C/C++", "必須条件\nC/C++の経験", expect("C", REQUIRED, "C++", REQUIRED)),
                Arguments.of("CとC++", "歓迎スキル\nCとC++の経験", expect("C", PREFERRED, "C++", PREFERRED)),
                Arguments.of("C#とC++はCにしない", "必須条件\nC#とC++の経験", expect("C#", REQUIRED, "C++", REQUIRED)),
                Arguments.of("英単語のgoは技術名にしない", "必須条件\nLet's go together", expect()),
                Arguments.of("Golang", "必須条件\nGolangの経験", expect("Go", REQUIRED)),
                Arguments.of("JavaScriptはJavaにしない", "必須条件\nJavaScriptの経験", expect("JavaScript", REQUIRED)),
                Arguments.of("Java.utilのような識別子は技術名にしない", "仕事内容\nJava.utilとAWS.Lambda", expect()),
                Arguments.of("React NativeはReactにしない", "必須条件\nReact Nativeでの開発経験",
                        expect("React Native", REQUIRED)),
                Arguments.of("Spring BootはSpringにしない", "必須条件\nSpring Bootの経験", expect("Spring Boot", REQUIRED)),
                Arguments.of("Ruby on RailsはRubyにしない", "必須条件\nRuby on Railsの経験", expect("Ruby on Rails", REQUIRED)),
                Arguments.of("直後に経験年数が続く", "必須条件\nJava3年以上の実務経験\nAWS1年以上\nDocker6ヶ月以上",
                        expect("Java", REQUIRED, "AWS", REQUIRED, "Docker", REQUIRED)),
                Arguments.of("全角の経験年数", "必須条件\nＪａｖａ３年以上", expect("Java", REQUIRED)),
                Arguments.of("Java8のような版の番号は技術名にしない", "仕事内容\nJava8とAWS2", expect()),
                Arguments.of("全角の英字", "必須条件\nＪａｖａとＡＷＳの経験", expect("Java", REQUIRED, "AWS", REQUIRED)),
                Arguments.of("大文字小文字を問わない", "必須条件\njavaとaws", expect("Java", REQUIRED, "AWS", REQUIRED)),
                Arguments.of("サイトが付け加えた他社の求人は使わない",
                        "必須条件\nJava経験\nこの企業が募集中のほかの求人\n必須条件\nPython経験",
                        expect("Java", REQUIRED))
        );
    }

    @Test
    void 必須_歓迎_応募資格_判定できず_その他の順に_同じ判定の中では現れた順に並べる() {
        List<SkillAnalysis> skills = analyze("""
                仕事内容
                Dockerで開発
                歓迎スキル
                AWS経験
                応募資格
                Python経験
                必須条件
                Java経験
                Go言語経験
                """);

        assertThat(skills).extracting(SkillAnalysis::name).containsExactly("Java", "Go", "AWS", "Python", "Docker");
    }

    @Test
    void 根拠は判定のもとになった行で_原文での位置を持つ() {
        String originalText = "仕事内容\nJavaで開発\n必須条件\n　Javaの実務経験3年以上";

        SkillAnalysis java = analyze(originalText).get(0);

        assertThat(java.level()).isEqualTo(REQUIRED);
        assertThat(java.evidence()).containsExactly(new AnalysisEvidence("必須条件", "Javaの実務経験3年以上", 19, 32));
        assertThat(originalText.substring(19, 32)).isEqualTo("Javaの実務経験3年以上");
    }

    @Test
    void 隅付き括弧の見出しの技術は_見出しの文を根拠にする() {
        String originalText = "給与\n月給30万円\n【Java経験者歓迎】\nPythonで開発";

        SkillAnalysis java = analyze(originalText).get(0);

        assertThat(java.evidence()).hasSize(1);
        AnalysisEvidence evidence = java.evidence().get(0);
        assertThat(originalText.substring(evidence.start(), evidence.end())).isEqualTo(evidence.text());
        assertThat(evidence.text()).isEqualTo("Java経験者歓迎");
    }

    @Test
    void 判定できないときは_必須の根拠と否定の根拠を両方返す() {
        SkillAnalysis java = analyze("必須条件\nJava経験\n応募資格\nJava経験不問").get(0);

        assertThat(java.level()).isEqualTo(UNDETERMINED);
        assertThat(java.evidence()).extracting(AnalysisEvidence::text).containsExactly("Java経験", "Java経験不問");
    }

    @Test
    void 応募資格と歓迎の両方にあるときは_応募資格の行と歓迎の行を両方根拠にする() {
        SkillAnalysis java = analyze("応募資格\nJava経験\n歓迎スキル\nJavaで5年以上の経験").get(0);

        assertThat(java.level()).isEqualTo(IN_REQUIREMENTS);
        assertThat(java.evidence()).extracting(AnalysisEvidence::text)
                .containsExactly("Java経験", "Javaで5年以上の経験");
    }

    @Test
    void 技術名がなければ空() {
        assertThat(analyze("営業職の募集です")).isEmpty();
        assertThat(analyze(null)).isEmpty();
    }
}
