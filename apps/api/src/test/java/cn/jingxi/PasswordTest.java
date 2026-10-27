package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class PasswordTest {
  @Test
  void cliHashUsesBcryptWithoutStoringPlaintext() {
    String hash = Application.hashPassword("a-test-secret");
    assertThat(new BCryptPasswordEncoder().matches("a-test-secret", hash)).isTrue();
    assertThat(hash).doesNotContain("a-test-secret");
  }
}
