package com.martinvolejnik.companykeeping;

import java.io.IOException;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class RequestBoundaryTest {
    @Test
    void repeatedFailedAccountRequestsDoNotLockAnotherAccountBehindTheSameProxy() {
        var attempts = new AccountAttempts();
        for (int i = 0; i < 12; i++) {
            attempts.begin("proxy", "owner@example.test");
            attempts.end("proxy", "owner@example.test", false);
        }
        assertThatThrownBy(() -> attempts.begin("proxy", "owner@example.test"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        attempts.begin("proxy", "second@example.test");
        attempts.end("proxy", "second@example.test", true);
    }

    @Test
    void bodiesWithoutAContentLengthAreMeasuredBeforeJacksonParsesThem() throws IOException {
        var advice = new JsonBodyLimit();
        byte[] valid = new byte[JsonBodyLimit.BYTES];
        Arrays.fill(valid, (byte) ' ');
        var input = new MockHttpInputMessage(valid);
        assertThat(input.getHeaders().getContentLength()).isNegative();
        var body = advice.beforeBodyRead(input,null,null,null).getBody();
        assertThat(body.readAllBytes()).containsExactly(valid);
        var tooLarge = new MockHttpInputMessage(Arrays.copyOf(valid, valid.length + 1));
        assertThatThrownBy(() -> advice.beforeBodyRead(tooLarge,null,null,null))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE));
    }
}
