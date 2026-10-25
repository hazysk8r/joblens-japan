package com.joblens.common.security;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.joblens.TestcontainersConfiguration;

import jakarta.servlet.http.Cookie;

/**
 * HTTPのローカル開発環境向けにSESSION_COOKIE_SECURE=falseを指定したとき、
 * Secureだけが外れ、ほかのCookie属性は維持されることを確認する。
 * (既定でSecureが付くことはAuthControllerTestで確認している。)
 */
@SpringBootTest(properties = "SESSION_COOKIE_SECURE=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SessionCookieSecureDisabledTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    @Test
    void SESSION_COOKIE_SECURE가_false면_Secure_없이_세션_쿠키를_발급한다() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .with(doubleSubmitCsrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "email": "user@example.com",
                              "password": "password123"
                            }
                            """))
                .andReturn();

        assertEquals(201, result.getResponse().getStatus());
        Cookie session = result.getResponse().getCookie("SESSION");
        assertNotNull(session, "セッションCookieが発行されていない");
        assertFalse(session.getSecure(), "SESSION_COOKIE_SECURE=falseなのにSecureが設定されている");
        assertTrue(session.isHttpOnly(), "Secureを外してもHttpOnlyは維持する");
    }
}
