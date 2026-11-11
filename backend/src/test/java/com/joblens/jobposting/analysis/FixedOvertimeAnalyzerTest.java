package com.joblens.jobposting.analysis;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Stream;

import static com.joblens.jobposting.analysis.FixedOvertimeStatus.ABSENT;
import static com.joblens.jobposting.analysis.FixedOvertimeStatus.NOT_MENTIONED;
import static com.joblens.jobposting.analysis.FixedOvertimeStatus.PRESENT;
import static com.joblens.jobposting.analysis.FixedOvertimeStatus.UNDETERMINED;
import static org.assertj.core.api.Assertions.assertThat;

class FixedOvertimeAnalyzerTest {

    /** 画面に出す区間と文だけを比べるための形。位置は別のテストで確かめる。 */
    private record Shown(String section, String text) {
    }

    private static List<Shown> shown(List<AnalysisEvidence> evidence) {
        return evidence.stream().map(item -> new Shown(item.section(), item.text())).toList();
    }

    @Test
    void 根拠は原文での位置を持ち_その位置で原文を切り出すと根拠の文になる() {
        String originalText = "給与\r\n　月給30万円（固定残業代40時間分を含む）　\r\n超過分は別途支給";

        List<AnalysisEvidence> evidence = analyze(originalText).evidence();

        assertThat(evidence).containsExactly(
                new AnalysisEvidence("給与", "月給30万円（固定残業代40時間分を含む）", 5, 26),
                new AnalysisEvidence("給与", "超過分は別途支給", 29, 37));
        assertThat(evidence).allSatisfy(item ->
                assertThat(originalText.substring(item.start(), item.end())).isEqualTo(item.text()));
    }

    @Test
    void 同じ文が繰り返されたら最初の位置を根拠にする() {
        List<AnalysisEvidence> evidence = analyze("固定残業代を含む\n固定残業代を含む").evidence();

        assertThat(evidence).containsExactly(new AnalysisEvidence(null, "固定残業代を含む", 0, 8));
    }

    @Test
    void 長い行は文だけを切り詰め_位置は行全体を指す() {
        String longLine = "固定残業代を含む" + "あ".repeat(300);

        AnalysisEvidence cut = analyze("\n" + longLine).evidence().get(0);

        assertThat(cut.start()).isEqualTo(1);
        assertThat(cut.end()).isEqualTo(1 + longLine.length());
    }

    @Test
    void 切り詰めは文字の途中で切らない() {
        String longLine = "固定残業代を含む" + "あ".repeat(191) + "😀" + "い".repeat(10);

        String text = analyze(longLine).evidence().get(0).text();

        assertThat(text).isEqualTo("固定残業代を含む" + "あ".repeat(191) + "😀…");
    }

    private static FixedOvertimeAnalysis analyze(String originalText) {
        return FixedOvertimeAnalyzer.analyze(PostingSectionSplitter.split(originalText));
    }

    private static String fixture(String name) throws IOException {
        try (InputStream in = FixedOvertimeAnalyzerTest.class.getResourceAsStream("/job-postings/" + name)) {
            assertThat(in).as("テスト用の求人票 %s", name).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @ParameterizedTest
    @MethodSource("固定残業代ありの表現")
    void 固定残業代の表現を検出し時間数を読み取る(String line, Integer expectedHours) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.hours()).isEqualTo(expectedHours);
        assertThat(shown(result.evidence())).containsExactly(new Shown(null, line));
    }

    private static Stream<Arguments> 固定残業代ありの表現() {
        return Stream.of(
                Arguments.of("固定残業代45時間分を含む", 45),
                Arguments.of("みなし残業手当（月45h）", 45),
                Arguments.of("定額残業代：月45H分", 45),
                Arguments.of("固定時間外手当（月20時間分）を支給", 20),
                Arguments.of("固定残業代４５時間分を含む", 45),
                Arguments.of("固定残業代75,000円を含む", null),
                Arguments.of("基本給には固定残業手当を含みます", null),
                // 「固定」「みなし」の語がなくても、残業代に時間数の「分」が付けば固定残業代。
                Arguments.of("月給30万円（時間外手当30時間分を含む）、超過分は全額支給", 30),
                Arguments.of("月給48万円＋残業手当(15時間分)", 15),
                Arguments.of("月給には残業代45H分を含みます", 45),
                Arguments.of("残業代は30時間相当分を月給に含む", 30));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "みなし残業手当を支給。他はありません",
            "みなし残業手当あり、住宅手当なし",
            "固定残業代を含むため住宅手当はありません",
            "みなし残業手当あり（無理な残業なし）",
            "固定残業代は無条件で30時間分を支給"
    })
    void 文や読点や括弧の後ろと含むの後ろの否定語は固定残業代の否定とみなさない(String line) {
        assertThat(analyze(line).status()).isEqualTo(PRESENT);
    }

    // 「なし」は利用者を安心させる判定のため、別の項目の否定を固定残業代の否定として読まない。
    @ParameterizedTest
    @MethodSource("別の項目の否定が続く固定残業代の表現")
    void 別の項目の否定が続いても固定残業代ありと判定する(String line, Integer expectedHours) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.hours()).isEqualTo(expectedHours);
    }

    private static Stream<Arguments> 別の項目の否定が続く固定残業代の表現() {
        return Stream.of(
                Arguments.of("固定残業代3万円/交通費なし", null),
                Arguments.of("みなし残業30時間 退職金なし", 30),
                Arguments.of("固定残業代30時間分 賞与なし", 30),
                Arguments.of("固定残業代あり賞与なし", null),
                Arguments.of("固定残業代は少ない", null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "固定残業代はない",
            "固定残業代がない求人です",
            "固定残業代はなく、残業代は別途支給します",
            "固定残業代もありません",
            "固定残業代ナシ",
            "固定残業代はございません",
            "固定残業代を含まず",
            "固定残業代は含まれない",
            "固定残業代は含まれません",
            "固定残業代は含まれず",
            "固定残業代は含まれていません",
            "固定残業代は含まれておりません",
            "固定残業代は支給しません",
            "固定残業代は導入しない",
            "固定残業代は適用せず",
            "固定残業代は採用していません",
            "固定残業代は設定しておりません",
            "固定残業代は支給なし",
            "固定残業代の支給なし",
            "固定残業代の適用はありません",
            "固定残業代の導入はありません",
            "固定残業代の設定はありません",
            "固定残業代の採用はありません",
            "固定残業代の制度はありません",
            "固定残業代の有無：無",
            "残業代は固定残業代ではなく、全額支給します"
    })
    void 固定残業代を否定するさまざまな表現をなしと判定する(String line) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(ABSENT);
        assertThat(shown(result.evidence())).containsExactly(new Shown(null, line));
    }

    @Test
    void 別の文の時間数は固定残業代の時間数とみなさない() {
        FixedOvertimeAnalysis result = analyze("残業代なし。研修40時間分");

        assertThat(result.status()).isEqualTo(UNDETERMINED);
        assertThat(result.hours()).isNull();
    }

    @Test
    void 残業代の語がなければ時間数の分があっても固定残業代とみなさない() {
        assertThat(analyze("研修は40時間分のカリキュラム").status()).isEqualTo(NOT_MENTIONED);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "固定残業代なし",
            "固定残業代：なし",
            "固定残業代 無し",
            "みなし残業はありません",
            "固定残業代制ではありません",
            "固定残業代：無",
            "固定残業代：無（残業代は別途支給）",
            "固定残業代の支給はありません",
            "固定残業代は、ありません",
            "月給30万円（固定残業代は含まない）",
            "固定残業代は含みません",
            "固定残業制度は導入していません",
            "残業代は全額支給します",
            "時間外手当は1分単位で支給",
            "時間外労働手当：全額支払い",
            "残業代１００％支給"
    })
    void 固定残業代がないことや残業代の全額支給が明記されていればなしと判定する(String line) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(ABSENT);
        assertThat(result.hours()).isNull();
        assertThat(result.excessPayStated()).isNull();
        assertThat(shown(result.evidence())).containsExactly(new Shown(null, line));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "残業はほぼありません",
            "平均残業時間 月10時間",
            "残業月10h程度",
            "みなし労働時間制",
            "通勤手当（全額支給）",
            "月給30万円"
    })
    void 残業代に触れていなければ記載なしと判定する(String line) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(NOT_MENTIONED);
        assertThat(result.hours()).isNull();
        assertThat(result.excessPayStated()).isNull();
        assertThat(shown(result.evidence())).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "残業代は規定により支給",
            "時間外勤務手当あり",
            "月給に残業手当を含む"
    })
    void 残業代に触れているが支払い方を解釈できなければ判定できずとする(String line) {
        FixedOvertimeAnalysis result = analyze(line);

        assertThat(result.status()).isEqualTo(UNDETERMINED);
        assertThat(shown(result.evidence())).containsExactly(new Shown(null, line));
    }

    @Test
    void 固定残業代ありとなしが両方書かれていれば矛盾として判定できずとし両方を根拠にする() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代なし
                給与
                固定残業代30時間分を含む
                """);

        assertThat(result.status()).isEqualTo(UNDETERMINED);
        assertThat(result.hours()).isNull();
        assertThat(result.excessPayStated()).isNull();
        assertThat(shown(result.evidence())).containsExactly(
                new Shown(null, "固定残業代なし"),
                new Shown("給与", "固定残業代30時間分を含む"));
    }

    @Test
    void 固定残業代ありと全額支給が両方あればありと判定する() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代40時間分を含む
                残業がない場合も固定残業代は全額支給し、残業代は1分単位で支給
                """);

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.hours()).isEqualTo(40);
    }

    @Test
    void なしの明記と解釈できない記載が両方あればなしと判定する() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代なし
                残業代は規定により支給
                """);

        assertThat(result.status()).isEqualTo(ABSENT);
        assertThat(shown(result.evidence())).containsExactly(new Shown(null, "固定残業代なし"));
    }

    @Test
    void 同じ時間数が繰り返されても一つに特定する() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代（月30時間分）を含む
                ※固定残業代は30時間を超えた分を別途支給
                """);

        assertThat(result.hours()).isEqualTo(30);
    }

    @Test
    void 異なる時間数が書かれていれば時間数を特定しない() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代（月30時間分）を含む
                管理職は固定残業代45時間分
                """);

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.hours()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "1か月の所定労働時間160時間、固定残業時間40時間として計算",
            "固定残業代40時間分を含む（実働8時間）",
            "固定残業代40時間分を含む（平均残業12時間）"
    })
    void 所定労働時間や実働時間や平均残業時間の数字は時間数に使わない(String line) {
        assertThat(analyze(line).hours()).isEqualTo(40);
    }

    @Test
    void 固定残業代の記載がない行の時間数は使わない() {
        FixedOvertimeAnalysis result = analyze("""
                固定残業代40時間分を含む
                残業は月20時間程度です
                """);

        assertThat(result.hours()).isEqualTo(40);
    }

    @ParameterizedTest
    @ValueSource(strings = {"固定残業代を含む（実働8時間）", "固定残業代を含む（1日8時間勤務）", "固定残業代を含む（1日 8時間）"})
    void 実働や1日あたりの時間しか数字がなければ時間数を特定しない(String line) {
        assertThat(analyze(line).hours()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"固定残業代30時間分（休日出勤を含む）", "平日の固定残業代30時間分"})
    void 日の字が数字の直前になければ時間数に使う(String line) {
        assertThat(analyze(line).hours()).isEqualTo(30);
    }

    @Test
    void 超過分の別途支給が明記されていなければfalseにする() {
        assertThat(analyze("固定残業代30時間分を含む").excessPayStated()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "固定残業時間を超過する分は別途支給します",
            "上記を超える時間外労働分は追加で支給",
            "30時間を超えた残業代は別途支払います",
            "超過分は全額支給",
            "30時間を超える残業代は全額支払います"
    })
    void 超過分の支給の明記が別の行にあってもtrueにする(String excessLine) {
        FixedOvertimeAnalysis result = analyze("固定残業代30時間分を含む\n" + excessLine);

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.excessPayStated()).isTrue();
        // 超過分の支給の判断も確かめられるよう、根拠に含める。
        assertThat(shown(result.evidence())).containsExactly(
                new Shown(null, "固定残業代30時間分を含む"),
                new Shown(null, excessLine));
    }

    @Test
    void 根拠は重複を除いて最大3件にし_長い行は200文字で切り詰める() {
        String longLine = "固定残業代を含む" + "あ".repeat(300);
        FixedOvertimeAnalysis result = analyze("""
                固定残業代を含む
                固定残業代を含む
                固定残業手当あり
                みなし残業あり
                定額残業代あり
                %s
                """.formatted(longLine));

        assertThat(shown(result.evidence())).containsExactly(
                new Shown(null, "固定残業代を含む"),
                new Shown(null, "固定残業手当あり"),
                new Shown(null, "みなし残業あり"));

        AnalysisEvidence cut = analyze(longLine).evidence().get(0);
        assertThat(cut.text()).hasSize(201).endsWith("…").startsWith("固定残業代を含む");
    }

    @Test
    void サイトが付け加えた他社の求人の固定残業代は判定に使わない() {
        FixedOvertimeAnalysis result = analyze("""
                給与
                月給30万円
                この企業が募集中のほかの求人
                月給35万円（固定残業代40時間分を含む）
                """);

        assertThat(result.status()).isEqualTo(NOT_MENTIONED);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\n\n"})
    void 原文が空なら記載なしとする(String originalText) {
        FixedOvertimeAnalysis result = analyze(originalText);

        assertThat(result.status()).isEqualTo(NOT_MENTIONED);
        assertThat(shown(result.evidence())).isEmpty();
    }

    @Test
    void Indeed形式の求人票_時間数が別の行にある固定残業手当を読み取る() throws IOException {
        FixedOvertimeAnalysis result = analyze(fixture("indeed-like-fixed-overtime.txt"));

        assertThat(result.status()).isEqualTo(PRESENT);
        assertThat(result.hours()).isEqualTo(40);
        assertThat(result.excessPayStated()).isTrue();
        assertThat(shown(result.evidence())).containsExactly(
                new Shown("給与", "基本給には固定残業手当を含み、固定残業時間を超える分は、別途時間外勤務手当を支給します。"),
                new Shown("給与", "固定残業手当：100,000円 〜 175,000円"),
                new Shown("給与", "※ 1か月の所定労働時間160時間、固定残業時間４０時間として計算"));
    }

    @Test
    void doda形式の求人票_全額支給の明記からなしと判定し_後ろの他社求人を無視する() throws IOException {
        FixedOvertimeAnalysis result = analyze(fixture("doda-like-full-overtime-pay.txt"));

        assertThat(result.status()).isEqualTo(ABSENT);
        assertThat(shown(result.evidence())).containsExactly(
                new Shown("平均残業時間", "月10時間程度（時間外手当は、1分単位で全額支給します）"),
                new Shown("待遇・福利厚生", "■時間外手当（1分単位全額支給）"));
    }
}
