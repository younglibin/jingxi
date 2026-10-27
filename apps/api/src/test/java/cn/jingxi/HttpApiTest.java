package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@org.springframework.test.context.TestExecutionListeners(
    listeners = {
      org.springframework.test.context.support.DependencyInjectionTestExecutionListener.class
    },
    mergeMode = org.springframework.test.context.TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"admin.username=test-admin", "server.servlet.session.cookie.secure=false"})
class HttpApiTest {
  static final ObjectMapper M = new ObjectMapper();
  static Path root;

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) throws Exception {
    root = Files.createTempDirectory("jingxi-http-");
    r.add("storage.root", () -> root.toString());
    r.add("admin.password-hash", () -> new BCryptPasswordEncoder().encode("test-only-password"));
  }

  @Value("${local.server.port}")
  int port;

  HttpClient client;
  String token;

  @BeforeEach
  void browser() {
    client =
        HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
  }

  HttpResponse<String> request(
      String method, String path, String body, String contentType, boolean csrf) throws Exception {
    var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
    if (contentType != null) b.header("Content-Type", contentType);
    if (csrf) b.header("X-CSRF-TOKEN", token);
    b.method(
        method,
        body == null
            ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body));
    return client.send(b.build(), HttpResponse.BodyHandlers.ofString());
  }

  JsonNode json(HttpResponse<String> response) throws Exception {
    return M.readTree(response.body());
  }

  void csrf() throws Exception {
    var r = request("GET", "/api/auth/csrf", null, null, false);
    assertThat(r.statusCode()).isEqualTo(200);
    token = json(r).path("token").asText();
    assertThat(token).isNotBlank();
  }

  void login() throws Exception {
    csrf();
    var r =
        request(
            "POST",
            "/api/auth/login",
            "username=test-admin&password=test-only-password&_csrf="
                + URLEncoder.encode(token, java.nio.charset.StandardCharsets.UTF_8),
            "application/x-www-form-urlencoded",
            false);
    assertThat(r.statusCode()).isEqualTo(200);
    assertThat(json(r).path("authenticated").asBoolean()).isTrue();
    csrf();
  }

  @Test
  void anonymousAdminAndCsrfAreJsonFailures() throws Exception {
    var admin = request("GET", "/api/admin/v1/works", null, null, false);
    assertThat(admin.statusCode()).isEqualTo(401);
    assertThat(json(admin).path("code").asText()).isEqualTo("UNAUTHENTICATED");
    var denied = request("POST", "/api/admin/v1/works", "{}", "application/json", false);
    assertThat(denied.statusCode()).isEqualTo(403);
    assertThat(json(denied).path("code").asText()).isEqualTo("FORBIDDEN");
  }

  @Test
  void healthAndPublicSiteDoNotRequireAuthentication() throws Exception {
    var health = request("GET", "/api/health", null, null, false);
    assertThat(health.statusCode()).isEqualTo(200);
    assertThat(json(health).path("status").asText()).isEqualTo("UP");
    var site = request("GET", "/api/public/v1/site", null, null, false);
    assertThat(site.statusCode()).isEqualTo(200);
    assertThat(site.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
    assertThat(site.body()).doesNotContain("password", "originalPath", "draft");
  }

  @Test
  void loginFailureIsJsonAndSessionCanLogout() throws Exception {
    csrf();
    var failed =
        request(
            "POST",
            "/api/auth/login",
            "username=test-admin&password=wrong&_csrf="
                + URLEncoder.encode(token, java.nio.charset.StandardCharsets.UTF_8),
            "application/x-www-form-urlencoded",
            false);
    assertThat(failed.statusCode()).isEqualTo(401);
    assertThat(json(failed).path("code").asText()).isEqualTo("BAD_CREDENTIALS");
    login();
    assertThat(request("GET", "/api/auth/session", null, null, false).statusCode()).isEqualTo(200);
    assertThat(request("POST", "/api/auth/logout", null, null, true).statusCode()).isEqualTo(200);
    assertThat(request("GET", "/api/auth/session", null, null, false).statusCode()).isEqualTo(401);
  }

  @Test
  void authenticatedCreateSaveConflictAndPreviewUseContract() throws Exception {
    login();
    var created = request("POST", "/api/admin/v1/works", "{}", "application/json", true);
    assertThat(created.statusCode()).isEqualTo(200);
    var w = json(created);
    String id = w.path("id").asText();
    var c = (ObjectNode) w.path("draft").path("content").deepCopy();
    c.put("title", "HTTP草稿");
    var body = M.createObjectNode().put("expectedDraftRevision", 1);
    body.set("content", c);
    var saved =
        request(
            "PUT",
            "/api/admin/v1/works/" + id + "/draft",
            body.toString(),
            "application/json",
            true);
    assertThat(saved.statusCode()).isEqualTo(200);
    assertThat(json(saved).path("draftRevision").asInt()).isEqualTo(2);
    var conflict =
        request(
            "PUT",
            "/api/admin/v1/works/" + id + "/draft",
            body.toString(),
            "application/json",
            true);
    assertThat(conflict.statusCode()).isEqualTo(409);
    assertThat(json(conflict).path("currentRevision").asInt()).isEqualTo(2);
    assertThat(
            request("GET", "/api/admin/v1/previews/works/" + id + "?revision=1", null, null, false)
                .statusCode())
        .isEqualTo(409);
    assertThat(
            request("GET", "/api/admin/v1/previews/works/" + id + "?revision=2", null, null, false)
                .statusCode())
        .isEqualTo(200);
  }

  @Test
  void anonymousDraftMediaAndTraversalRemainUnavailable() throws Exception {
    assertThat(request("GET", "/media/unknown/480", null, null, false).statusCode()).isEqualTo(404);
    assertThat(request("GET", "/api/admin/v1/assets/x/image/480", null, null, false).statusCode())
        .isEqualTo(401);
    assertThat(request("GET", "/media/..%2Fdata%2Fstore.json/480", null, null, false).statusCode())
        .isIn(400, 404);
  }
}
