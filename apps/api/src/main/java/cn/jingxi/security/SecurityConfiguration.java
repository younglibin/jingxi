package cn.jingxi.security;

import cn.jingxi.store.JsonStore;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;

@Configuration
public class SecurityConfiguration {
  @Bean
  PasswordEncoder encoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  UserDetailsService users(
      @Value("${admin.username}") String username, @Value("${admin.password-hash}") String hash) {
    if (username.isBlank() || !hash.matches("\\$2[aby]\\$\\d\\d\\$.{53}"))
      throw new IllegalStateException(
          "Set ADMIN_USERNAME and a BCrypt ADMIN_PASSWORD_HASH; no default credentials exist");
    return new InMemoryUserDetailsManager(
        User.withUsername(username).password(hash).roles("ADMIN").build());
  }

  @Bean
  SecurityFilterChain chain(HttpSecurity http) throws Exception {
    var attempts = new LoginAttempts();
    http.addFilterBefore(
        new org.springframework.web.filter.OncePerRequestFilter() {
          protected void doFilterInternal(
              HttpServletRequest req, HttpServletResponse res, jakarta.servlet.FilterChain chain)
              throws jakarta.servlet.ServletException, IOException {
            if (req.getMethod().equals("POST")
                && req.getServletPath().equals("/api/auth/login")
                && attempts.blocked(req.getRemoteAddr())) {
              json(res, 429, Map.of("code", "LOGIN_RATE_LIMIT", "message", "尝试过于频繁，请稍后再试"));
              return;
            }
            chain.doFilter(req, res);
          }
        },
        org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class);
    var repository = new HttpSessionCsrfTokenRepository();
    repository.setHeaderName("X-CSRF-TOKEN");
    http.csrf(
        csrf ->
            csrf.csrfTokenRepository(repository)
                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                .ignoringRequestMatchers("/api/public/v1/works/browse"));
    http.authorizeHttpRequests(
        a ->
            a.requestMatchers(
                    "/api/health",
                    "/api/auth/csrf",
                    "/api/auth/login",
                    "/api/public/**",
                    "/media/**")
                .permitAll()
                .anyRequest()
                .authenticated());
    http.exceptionHandling(
        e ->
            e.authenticationEntryPoint(
                    (req, res, ex) ->
                        json(res, 401, Map.of("code", "UNAUTHENTICATED", "message", "请先登录")))
                .accessDeniedHandler(
                    (req, res, ex) ->
                        json(res, 403, Map.of("code", "FORBIDDEN", "message", "请求校验失败"))));
    http.formLogin(
        f ->
            f.loginProcessingUrl("/api/auth/login")
                .successHandler(
                    (req, res, auth) -> {
                      attempts.succeeded(req.getRemoteAddr());
                      json(res, 200, Map.of("authenticated", true, "username", auth.getName()));
                    })
                .failureHandler(
                    (req, res, ex) -> {
                      attempts.failed(req.getRemoteAddr());
                      json(res, 401, Map.of("code", "BAD_CREDENTIALS", "message", "用户名或密码错误"));
                    }));
    http.logout(
        l ->
            l.logoutUrl("/api/auth/logout")
                .logoutSuccessHandler(
                    (req, res, auth) -> json(res, 200, Map.of("authenticated", false)))
                .deleteCookies("JSESSIONID"));
    http.requestCache(c -> c.disable());
    http.httpBasic(b -> b.disable());
    return http.build();
  }

  public static void json(HttpServletResponse response, int status, Object data)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    response.setHeader("Cache-Control", "no-store");
    JsonStore.JSON.writeValue(response.getOutputStream(), data);
  }
}
