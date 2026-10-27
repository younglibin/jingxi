package cn.jingxi.web;

import java.security.Principal;
import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthController {
  @GetMapping("/api/auth/csrf")
  Object csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", "X-CSRF-TOKEN");
  }

  @GetMapping("/api/auth/session")
  Object session(Principal principal) {
    return Map.of("authenticated", true, "username", principal.getName());
  }

  @GetMapping("/api/health")
  Object health() {
    return Map.of("status", "UP");
  }
}
