package com.joblens.auth.service;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.joblens.TestcontainersConfiguration;

/**
 * 全体の登録者数の上限を検証する。上限に達しても、既存のユーザーは影響を受けない。
 */
@SpringBootTest(properties = "joblens.limits.max-users=2")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@ExtendWith(OutputCaptureExtension.class)
class SignupLimitTest {

    private static final String PASSWORD = "password123";
    private static final String CAP_LOG_MESSAGE = "会員登録の上限に達しました";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    private String credentials(String email) {
        return """
            {
              "email": "%s",
              "password": "%s"
            }
            """.formatted(email, PASSWORD);
    }

    private ResultActions signup(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                .with(doubleSubmitCsrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(credentials(email)));
    }

    private void fillToCap() throws Exception {
        signup("first@example.com").andExpect(status().isCreated());
        signup("second@example.com").andExpect(status().isCreated());
    }

    private long userCount() {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM users", Long.class);
    }

    @Test
    void 上限に達すると新規登録を409で拒否し_警告を記録してログイン状態にしない(CapturedOutput output) throws Exception {
        fillToCap();
        assertFalse(output.getAll().contains(CAP_LOG_MESSAGE), "上限に達する前に警告を記録している");

        MvcResult result = signup("third@example.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIGNUP_CLOSED"))
                .andReturn();

        assertEquals(2, userCount());
        assertNull(result.getResponse().getCookie("SESSION"), "拒否したのにセッションを発行している");
        assertTrue(output.getAll().contains(CAP_LOG_MESSAGE), "運営者が気付くための警告が記録されていない");
        assertFalse(output.getAll().contains("third@example.com"), "警告にメールアドレスを記録している");
    }

    @Test
    void 上限に達していても登録済みのメールアドレスには重複エラーを返す() throws Exception {
        fillToCap();

        signup("first@example.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
    }

    @Test
    void 上限に達していてもログインできる() throws Exception {
        fillToCap();

        mockMvc.perform(post("/api/auth/login")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("first@example.com")))
                .andExpect(status().isOk());
    }

    @Test
    void ユーザーが減ると再び登録できる() throws Exception {
        fillToCap();
        signup("third@example.com").andExpect(status().isConflict());

        jdbcTemplate.update("DELETE FROM users WHERE email = 'first@example.com'");

        signup("third@example.com").andExpect(status().isCreated());
    }
}
