package com.joblens.auth.service;

import static com.joblens.CsrfTestSupport.doubleSubmitCsrf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.joblens.TestcontainersConfiguration;
import com.joblens.auth.repository.UserRepository;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SignupConstraintViolationTest {

    private static final String BODY = """
            {
              "email": "user@example.com",
              "password": "password123"
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM spring_session");
        jdbcTemplate.update("DELETE FROM users");
    }

    private ResultActions signup() throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                .with(doubleSubmitCsrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY));
    }

    @Test
    void 同時登録でメールアドレスの一意制約に違反すると重複エラーを返す() throws Exception {
        signup().andExpect(status().isCreated());
        // 事前の重複確認を通過したあとで、別のリクエストが先に登録した場合を再現する。実際のDB制約に当てる。
        doReturn(false).when(userRepository).existsByEmail(anyString());

        signup()
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
    }

    @Test
    void メールアドレスの一意制約ではない違反を重複に変えない() throws Exception {
        doThrow(new DataIntegrityViolationException("other constraint"))
                .when(userRepository).saveAndFlush(any());

        signup()
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"));
    }
}
