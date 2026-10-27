package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import cn.jingxi.security.LoginAttempts;
import org.junit.jupiter.api.Test;

class LoginAttemptsTest {
  @Test
  void tenFailuresBlockFurtherAttemptsAndSuccessResetsCounter() {
    var attempts = new LoginAttempts();
    for (int i = 0; i < 9; i++) attempts.failed("local");
    assertThat(attempts.blocked("local")).isFalse();
    attempts.failed("local");
    assertThat(attempts.blocked("local")).isTrue();
    assertThat(attempts.blocked("other")).isFalse();
    attempts.succeeded("local");
    assertThat(attempts.blocked("local")).isFalse();
  }
}
