package com.joblens.jobposting.analysis;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * 原文の上限(2万文字)の悪い入力でも、分析がすぐに終わることを確かめる。
 *
 * 分析は詳細画面だけでなく一覧でも求人ごとに行い、照会にはリクエスト数の制限がない。
 * 1件の分析に時間がかかると、危ない原文を保存して一覧を開くだけで、サーバーのCPUを使い続けられる。
 * 普通の求人票の分析は数十ミリ秒のため、上限を十分に余裕のある値にして、遅い環境でも揺れないようにする。
 */
class AnalysisWorstCaseInputTest {

    private static final int MAX_ORIGINAL_TEXT_LENGTH = 20000;
    private static final Duration LIMIT = Duration.ofMillis(500);

    // 1行の中で、同じ文字が末尾以外で長く続く原文。
    private static String longRun(String fill) {
        return "a" + fill.repeat(MAX_ORIGINAL_TEXT_LENGTH - 2) + "b";
    }

    @ParameterizedTest
    @ValueSource(strings = {" ", "\t", ":", "】", "」", ">", "]"})
    void 同じ記号や空白が長く続く1行でも分析がすぐに終わる(String fill) {
        String originalText = longRun(fill);

        assertTimeoutPreemptively(LIMIT, () -> {
            List<PostingSection> sections = PostingSectionSplitter.split(originalText);
            FixedOvertimeAnalyzer.analyze(sections);
            SkillAnalyzer.analyze(sections);
        });
    }

    // ---- 正規表現をやめても、結果が変わらないこと

    /** 以前の正規表現。結果を比べるためだけに使う。 */
    private static final Pattern FORMER_TRAILING_COLON = Pattern.compile("\\s*:$");
    private static final Pattern FORMER_LABEL_DECORATION =
            Pattern.compile("^[\\s■◆●○◇□・*\\-<>\\[\\]〈〉《》【】「」]+|[\\s:<>\\[\\]〉》】」]+$");

    /**
     * 記号・空白・普通の文字を混ぜた短い文字列。
     * 行には改行を含まないため、改行の文字は入れない(正規表現の$は改行の前にも一致するため、比べる意味がない)。
     * 全角空白やノーブレークスペースは、正規表現の\sに含まれないことを確かめるために入れる。
     */
    private static final String[] ALPHABET = {
            " ", "\t", "\u000B", "\f", "　", " ",
            ":", "■", "◆", "●", "○", "◇", "□", "・", "*", "-", "<", ">", "[", "]",
            "〈", "〉", "《", "》", "【", "】", "「", "」",
            "必", "須", "a", "😀",
    };

    private static List<String> randomTexts() {
        Random random = new Random(20261120);
        List<String> texts = new ArrayList<>(List.of("", ":", " :", "給与 :", "給与:", "給与::", "【必須】:", "■ 必須 ■"));
        for (int i = 0; i < 20000; i++) {
            StringBuilder text = new StringBuilder();
            int length = random.nextInt(10);
            for (int j = 0; j < length; j++) {
                text.append(ALPHABET[random.nextInt(ALPHABET.length)]);
            }
            texts.add(text.toString());
        }
        return texts;
    }

    @Test
    void 末尾のコロンの除き方は以前の正規表現と同じ結果になる() {
        for (String text : randomTexts()) {
            assertEquals(FORMER_TRAILING_COLON.matcher(text).replaceFirst(""),
                    PostingSectionSplitter.removeTrailingColon(text), () -> "入力: [" + text + "]");
        }
    }

    @Test
    void 表示の記号の除き方は以前の正規表現と同じ結果になる() {
        for (String text : randomTexts()) {
            assertEquals(FORMER_LABEL_DECORATION.matcher(text).replaceAll(""),
                    SkillAnalyzer.removeLabelDecoration(text), () -> "入力: [" + text + "]");
        }
    }
}
