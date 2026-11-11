package com.joblens.jobposting.analysis;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 求人票の区間から固定残業代(みなし残業・定額残業)の有無を判定する。
 *
 * <p>判定の順序:
 * <ol>
 *   <li>ありの記載となしの明記が両方ある → 矛盾として判定できず</li>
 *   <li>ありの記載がある → あり</li>
 *   <li>なしの明記、または残業代の全額支給の明記がある → なし</li>
 *   <li>残業代に触れているが上のどれでもない → 判定できず</li>
 *   <li>どれもない → 記載なし</li>
 * </ol>
 * 「固定残業代は全額支給」のように、ありの記載と全額支給が並ぶことがあるため、全額支給はありより弱い扱いにする。
 */
public final class FixedOvertimeAnalyzer {

    private static final String KEYWORD = "(?:固定残業|みなし残業|定額残業|固定時間外)";

    /** キーワードと否定の間に置ける語。「固定残業代の支給はありません」の「の支給は」など。 */
    private static final String NEGATION_CONNECTOR =
            "(?:の(?:支給|適用|導入|設定|採用|制度|有無))?(?:は|が|も|を|では|:)?[、,]?\\s*";
    private static final String NEGATION = "(?:なし|無し|ナシ|ない|なく|ありません|ございません"
            + "|含まない|含みません|含まず|含まれない|含まれません|含まれず|含まれていません|含まれておりません"
            + "|(?:支給|導入|適用|採用|設定)?(?:していません|しておりません|しません|しない|せず|なし)"
            + "|無(?=$|[\\s()、。,/]))";
    /**
     * 「固定残業代なし」「固定残業代の支給はありません」のような否定。
     * 「みなし」の「なし」と区別するため、キーワードの後ろだけを見る。
     * 「なし」は利用者を安心させる判定のため、間に置ける語を決まった表現に限る。
     * 「固定残業代3万円/交通費なし」のような別の項目の否定を拾わないため。
     * 知らない言い回しは否定と読まず、ありの判定と根拠の表示で利用者に確認してもらう。
     */
    private static final Pattern NEGATED_KEYWORD = Pattern.compile(
            KEYWORD + "(?:代|手当|時間)?(?:制度|制)?" + NEGATION_CONNECTOR + NEGATION);
    private static final Pattern POSITIVE_KEYWORD = Pattern.compile(KEYWORD);
    private static final Pattern OVERTIME_PAY = Pattern.compile("(?:残業|時間外(?:労働|勤務)?)(?:代|手当)");
    /** 「時間外手当30時間分」のように、「固定」の語がなくても同じ文で時間数の「分」が付いた残業代は固定残業代。 */
    private static final Pattern HOURS_PORTION = Pattern.compile("(?<![\\d.,])\\d{1,3}\\s*(?:時間|h)\\s*(?:相当)?分",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FULL_PAY = Pattern.compile("全額(?:支給|支払)|1分単位|100%支給");
    /** 「超過分は別途支給」「超過分は全額支給」のように、固定残業時間を超えた分の支給の明記。 */
    private static final Pattern EXCESS_PAY = Pattern.compile(
            "(?:超過|超え)[^。]{0,30}?(?:別途|追加|全額)[^。]{0,20}?(?:支給|支払)");
    private static final Pattern HOURS = Pattern.compile("(?<![\\d.,])(\\d{1,3})\\s*(?:時間|h)(?![a-z])",
            Pattern.CASE_INSENSITIVE);
    /** 時間数の直前にこれらの語があれば、固定残業ではなく所定労働時間や1日の勤務時間などの数字とみなす。 */
    private static final Pattern NON_OVERTIME_HOURS_CONTEXT = Pattern.compile("所定|実働|平均|日\\s*$");
    private static final int HOURS_CONTEXT_LENGTH = 8;

    private static final int MAX_EVIDENCE = 3;
    private static final int MAX_EVIDENCE_LENGTH = 200;

    private FixedOvertimeAnalyzer() {
    }

    public static FixedOvertimeAnalysis analyze(List<PostingSection> sections) {
        List<Line> lines = new ArrayList<>();
        for (PostingSection section : sections) {
            for (SourceLine line : section.lines()) {
                lines.add(Line.of(section.heading(), line));
            }
        }

        boolean present = lines.stream().anyMatch(Line::positive);
        boolean negated = lines.stream().anyMatch(Line::negated);
        boolean fullPay = lines.stream().anyMatch(Line::fullPay);
        boolean mentioned = lines.stream().anyMatch(Line::mentionsOvertimePay);

        if (present && negated) {
            return result(FixedOvertimeStatus.UNDETERMINED, null, null,
                    evidence(lines, line -> line.positive() || line.negated()));
        }
        if (present) {
            return result(FixedOvertimeStatus.PRESENT, hours(lines),
                    lines.stream().anyMatch(Line::excessPay),
                    evidence(lines, line -> line.positive() || line.excessPay()));
        }
        if (negated || fullPay) {
            return result(FixedOvertimeStatus.ABSENT, null, null,
                    evidence(lines, line -> line.negated() || line.fullPay()));
        }
        if (mentioned) {
            return result(FixedOvertimeStatus.UNDETERMINED, null, null,
                    evidence(lines, Line::mentionsOvertimePay));
        }
        return result(FixedOvertimeStatus.NOT_MENTIONED, null, null, List.of());
    }

    private static FixedOvertimeAnalysis result(
            FixedOvertimeStatus status, Integer hours, Boolean excessPayStated, List<AnalysisEvidence> evidence) {
        return new FixedOvertimeAnalysis(status, hours, excessPayStated, evidence);
    }

    /** ありの記載がある行の時間数が一つに特定できるときだけ返す。 */
    private static Integer hours(List<Line> lines) {
        Set<Integer> values = new LinkedHashSet<>();
        for (Line line : lines) {
            if (!line.positive()) {
                continue;
            }
            Matcher matcher = HOURS.matcher(line.normalized());
            while (matcher.find()) {
                int contextStart = Math.max(0, matcher.start() - HOURS_CONTEXT_LENGTH);
                String context = line.normalized().substring(contextStart, matcher.start());
                if (!NON_OVERTIME_HOURS_CONTEXT.matcher(context).find()) {
                    values.add(Integer.parseInt(matcher.group(1)));
                }
            }
        }
        return values.size() == 1 ? values.iterator().next() : null;
    }

    private static List<AnalysisEvidence> evidence(List<Line> lines, Predicate<Line> relevant) {
        // 同じ区間の同じ文は一つにまとめ、最初の位置を根拠にする。
        Map<List<String>, AnalysisEvidence> evidence = new LinkedHashMap<>();
        for (Line line : lines) {
            if (evidence.size() >= MAX_EVIDENCE) {
                break;
            }
            if (relevant.test(line)) {
                String text = truncate(line.source().text());
                evidence.putIfAbsent(Arrays.asList(line.section(), text), new AnalysisEvidence(
                        line.section(), text, line.source().start(), line.source().end()));
            }
        }
        return List.copyOf(evidence.values());
    }

    /** 残業代の語と時間数の「分」が同じ文にあるか。別の文の「研修40時間分」などを固定残業代と読まない。 */
    private static boolean statesHoursPortion(String normalized) {
        return Arrays.stream(normalized.split("。")).anyMatch(sentence ->
                OVERTIME_PAY.matcher(sentence).find() && HOURS_PORTION.matcher(sentence).find());
    }

    /** 絵文字などのサロゲートペアを途中で切らないよう、コードポイントの数で切り詰める。 */
    private static String truncate(String text) {
        if (text.codePointCount(0, text.length()) <= MAX_EVIDENCE_LENGTH) {
            return text;
        }
        return text.substring(0, text.offsetByCodePoints(0, MAX_EVIDENCE_LENGTH)) + "…";
    }

    /** 1行分の判定材料。 */
    private record Line(
            String section,
            SourceLine source,
            String normalized,
            boolean positive,
            boolean negated,
            boolean fullPay,
            boolean mentionsOvertimePay,
            boolean excessPay) {

        static Line of(String section, SourceLine source) {
            String normalized = PostingSectionSplitter.normalize(source.text());
            boolean negated = NEGATED_KEYWORD.matcher(normalized).find();
            boolean mentionsOvertimePay = OVERTIME_PAY.matcher(normalized).find();
            // 否定された箇所を取り除いても残るキーワードだけを「あり」の記載とみなす。
            boolean positive = POSITIVE_KEYWORD.matcher(
                    NEGATED_KEYWORD.matcher(normalized).replaceAll("")).find()
                    || statesHoursPortion(normalized);
            boolean fullPay = mentionsOvertimePay && FULL_PAY.matcher(normalized).find();
            boolean excessPay = EXCESS_PAY.matcher(normalized).find();
            return new Line(section, source, normalized, positive, negated, fullPay, mentionsOvertimePay,
                    excessPay);
        }
    }
}
