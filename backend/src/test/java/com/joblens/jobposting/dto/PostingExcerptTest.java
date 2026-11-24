package com.joblens.jobposting.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * 一覧のカードに出す原文の要約を検証する。
 * 検索語がないときの規則は、以前に画面で作っていた要約(excerptOf)と同じ結果になるようにする。
 */
class PostingExcerptTest {

    @Nested
    class 検索語がないとき {

        @Test
        void 上限以下の文はそのまま返し_省略記号を付けない() {
            assertEquals("短い求人票", PostingExcerpt.of("短い求人票", null));
        }

        @Test
        void ちょうど上限の長さなら省略しない() {
            String text = "あ".repeat(100);

            assertEquals(text, PostingExcerpt.of(text, null));
        }

        @Test
        void 上限を超えたら上限までにして省略記号を付ける() {
            assertEquals("あ".repeat(100) + "…", PostingExcerpt.of("あ".repeat(101), null));
        }

        @Test
        void 改行や続く空白は1つの空白にまとめ_前後の空白は除く() {
            assertEquals("【給与】 月給30万円 （固定残業代なし）",
                    PostingExcerpt.of("  【給与】\n\n月給30万円\t\t（固定残業代なし）\r\n ", null));
        }

        @Test
        void 全角空白やノーブレークスペースも空白としてまとめる() {
            // 画面の正規表現(\s)と同じく、Unicodeの空白も空白として扱う。
            assertEquals("給与 月給 30万円", PostingExcerpt.of("　給与　　月給 30万円 ", null));
        }

        @Test
        void 空白をまとめた後の長さで上限を判定する() {
            assertEquals("あ".repeat(50) + " " + "い".repeat(49),
                    PostingExcerpt.of("あ".repeat(50) + "\n\n\n" + "い".repeat(49), null));
        }

        // UTF-16の単位で切ると、サロゲートペアの片方だけが残って文字化けする。
        @Test
        void サロゲートペアの文字を途中で切らない() {
            assertEquals("𠮷".repeat(100) + "…", PostingExcerpt.of("𠮷".repeat(101), null));
        }

        @Test
        void 空白だけの検索語は検索語がないものとして扱う() {
            assertEquals("あ".repeat(100) + "…", PostingExcerpt.of("あ".repeat(101) + "AWS", "  "));
        }
    }

    @Nested
    class 原文に検索語があるとき {

        private static final String BEFORE = "前".repeat(60);
        private static final String AFTER = "後".repeat(60);

        @Test
        void 最初に見つかった位置の20文字前から100文字を出し_前後に省略記号を付ける() {
            String excerpt = PostingExcerpt.of(BEFORE + "Kubernetes" + AFTER + AFTER + "Kubernetes", "Kubernetes");

            assertEquals("…" + "前".repeat(20) + "Kubernetes" + "後".repeat(70) + "…", excerpt);
        }

        @Test
        void 前に20文字がなければ先頭から出し_前に省略記号を付けない() {
            String excerpt = PostingExcerpt.of("前".repeat(5) + "AWS" + AFTER + AFTER, "AWS");

            assertEquals("前".repeat(5) + "AWS" + "後".repeat(92) + "…", excerpt);
        }

        @Test
        void 末尾の近くで見つかったら_末尾まで100文字になるよう前を広げる() {
            String excerpt = PostingExcerpt.of(BEFORE + BEFORE + "AWS" + "後".repeat(5), "AWS");

            assertEquals("…" + "前".repeat(92) + "AWS" + "後".repeat(5), excerpt);
        }

        @Test
        void 原文が短ければ検索語があっても全体を出す() {
            assertEquals("開発環境：AWS、Docker", PostingExcerpt.of("開発環境：AWS、Docker", "docker"));
        }

        @Test
        void 大文字と小文字を区別せずに探す() {
            String excerpt = PostingExcerpt.of(BEFORE + "AWS" + AFTER + AFTER, "aws");

            assertEquals("…" + "前".repeat(20) + "AWS" + "後".repeat(77) + "…", excerpt);
        }

        @Test
        void 空白をまとめた後の原文で探し_位置は文字単位で数える() {
            String excerpt = PostingExcerpt.of("😀".repeat(30) + "\n\n開発環境 AWS" + AFTER + AFTER, "開発環境 AWS");

            assertEquals("…" + "😀".repeat(19) + " 開発環境 AWS" + "後".repeat(72) + "…", excerpt);
        }

        @Test
        void 検索語の続く空白や全角空白も1つの空白にまとめてから探す() {
            // 日本語入力で打った全角空白でも、原文の空白をまとめた後の文と比べられるようにする。
            String excerpt = PostingExcerpt.of(BEFORE + "開発環境\n\nAWS" + AFTER + AFTER, "開発環境　　AWS");

            assertEquals("…" + "前".repeat(20) + "開発環境 AWS" + "後".repeat(72) + "…", excerpt);
        }

        @Test
        void 原文に見つからなければ先頭から出す() {
            // タイトルや会社名で見つかった求人。
            assertEquals("あ".repeat(100) + "…", PostingExcerpt.of("あ".repeat(101), "株式会社"));
        }

        @Test
        void 検索語が100文字より長ければ探さずに先頭から出す() {
            String keyword = "あ".repeat(101);

            assertEquals("前".repeat(100) + "…", PostingExcerpt.of(BEFORE + BEFORE + keyword, keyword));
        }

        @Test
        void ちょうど100文字の検索語は探して出す() {
            String keyword = "あ".repeat(100);

            assertEquals("…" + keyword, PostingExcerpt.of(BEFORE + keyword, keyword));
        }
    }

    @Test
    void 原文の上限の長さで見つからない検索語でも_一覧の1ページ分をすぐに作れる() {
        // 1文字目以外が一致し続ける、比べる回数が最も多い組み合わせ。
        String originalText = "a".repeat(20000);
        String keyword = "a".repeat(99) + "b";

        assertTimeoutPreemptively(Duration.ofMillis(500), () -> {
            for (int i = 0; i < 20; i++) {
                PostingExcerpt.of(originalText, keyword);
            }
        });
    }
}
