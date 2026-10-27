package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import cn.jingxi.content.PortfolioService;
import cn.jingxi.store.JsonStore;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Path;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class SettingsTest {
  @TempDir Path root;
  JsonStore store;
  PortfolioService service;

  @BeforeEach
  void start() throws Exception {
    store = new JsonStore(root);
    service = new PortfolioService(store);
  }

  @AfterEach
  void stop() throws Exception {
    store.close();
  }

  @Test
  void renamedCategoriesResolveReferencesAndSystemCategoryCannotBeDisabled() {
    var cat = service.createCategory("包装", "packaging");
    assertThat(cat).isNotNull();
    String id = cat.path("id").asText();
    var w = service.createWork();
    var c = (ObjectNode) w.path("draft").path("content").deepCopy();
    c.put("categoryId", id);
    service.save(w.path("id").asText(), 1, c);
    var input =
        PortfolioService.object()
            .put("expectedRevision", 1)
            .put("name", "包装设计")
            .put("enabled", false)
            .put("sortOrder", 2);
    var renamed = service.updateCategory(id, input);
    assertThat(renamed.path("name").asText()).isEqualTo("包装设计");
    assertThat(service.categories().path("items").get(1).path("draftReferenceCount").asInt())
        .isEqualTo(1);
    assertThatThrownBy(() -> service.deleteCategory(id, 2)).isInstanceOf(RuntimeException.class);
    assertThatThrownBy(() -> service.updateCategory("category-other", input))
        .isInstanceOf(RuntimeException.class);
    var fresh = service.createWork();
    var freshContent = (ObjectNode) fresh.path("draft").path("content").deepCopy();
    freshContent.put("categoryId", id);
    assertThatThrownBy(() -> service.save(fresh.path("id").asText(), 1, freshContent))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void migrationChangesSelectedDraftsAndAllowsDeletion() {
    var cat = service.createCategory("品牌", "brand");
    String id = cat.path("id").asText();
    var w = service.createWork();
    var c = (ObjectNode) w.path("draft").path("content").deepCopy();
    c.put("categoryId", id);
    w = service.save(w.path("id").asText(), 1, c);
    var request = PortfolioService.object().put("targetCategoryId", "category-other");
    request
        .putArray("works")
        .addObject()
        .put("id", w.path("id").asText())
        .put("expectedDraftRevision", 2);
    assertThat(service.migrateCategory(id, request).path("updated").asInt()).isEqualTo(1);
    assertThat(
            service
                .work(w.path("id").asText())
                .path("draft")
                .path("content")
                .path("categoryId")
                .asText())
        .isEqualTo("category-other");
    assertThat(service.deleteCategory(id, 1).path("deleted").asBoolean()).isTrue();
  }

  @Test
  void siteDraftIsPrivateAndPublishedConfigurationResolvesCards() {
    var initial = service.siteDraft();
    assertThat(initial).isNotNull();
    var c = (ObjectNode) initial.path("draft").path("content").deepCopy();
    ((ObjectNode) c.path("brand")).put("name", "未公开品牌");
    var saved = service.saveSite(1, c);
    assertThat(service.publicSite().path("brand").path("name").asText()).isEqualTo("鲸禧设计");
    assertThat(service.previewSite(2).path("brand").path("name").asText()).isEqualTo("未公开品牌");
    assertThatThrownBy(() -> service.previewSite(1)).isInstanceOf(RuntimeException.class);
    service.publishSite(2, saved.path("stateRevision").asLong());
    assertThat(service.publicSite().path("brand").path("name").asText()).isEqualTo("未公开品牌");
    assertThat(service.publicSite().path("homepage").path("hero").path("works").isArray()).isTrue();
    assertThat(service.publicSite().toString())
        .doesNotContain("AssetId", "draftRevision", "originalPath");
    assertThatThrownBy(() -> service.saveSite(1, c)).isInstanceOf(RuntimeException.class);
  }

  @Test
  void siteRejectsUnknownAssetsUnsafeLinksAndOverflow() {
    var c = (ObjectNode) service.siteDraft().path("draft").path("content").deepCopy();
    ((ObjectNode) c.path("contact"))
        .withArray("links")
        .addObject()
        .put("label", "bad")
        .put("url", "javascript:alert(1)");
    assertThatThrownBy(() -> service.saveSite(1, c)).isInstanceOf(RuntimeException.class);
  }

  @Test
  void teamAndBannerLogosKeepImageAndLinkFieldsSeparate() {
    store.mutate(
        s -> {
          var a =
              s.withArray("assets")
                  .addObject()
                  .put("id", "logo")
                  .put("publicToken", "logo-token")
                  .put("width", 100)
                  .put("height", 100);
          a.putArray("displayImages")
              .addObject()
              .put("size", 480)
              .put("width", 100)
              .put("height", 100);
        });
    var c = (ObjectNode) service.siteDraft().path("draft").path("content").deepCopy();
    ((ObjectNode) c.path("about"))
        .withArray("teamImages")
        .addObject()
        .put("assetId", "logo")
        .put("caption", "团队");
    ((ObjectNode) c.path("homepage").path("banner"))
        .withArray("logos")
        .addObject()
        .put("assetId", "logo")
        .put("url", "https://example.com");
    var site = service.saveSite(1, c);
    service.publishSite(2, site.path("stateRevision").asLong());
    var dto = service.publicSite();
    assertThat(dto.path("about").path("teamImages").get(0).path("image").path("url").asText())
        .isEqualTo("/media/logo-token/480");
    assertThat(dto.path("homepage").path("banner").path("logos").get(0).path("url").asText())
        .isEqualTo("https://example.com");
    assertThat(
            dto.path("homepage")
                .path("banner")
                .path("logos")
                .get(0)
                .path("image")
                .path("width")
                .asInt())
        .isEqualTo(100);
  }

  @Test
  void closingIconsAcceptApprovedKeysAndRejectUnknownOnes() {
    var c = (ObjectNode) service.siteDraft().path("draft").path("content").deepCopy();
    var closing = (ObjectNode) c.path("homepage").path("closing");
    for (String icon : java.util.List.of("star", "circle", "diamond", "wave", "flower", "arrow"))
      closing.withArray("iconKeys").add(icon);
    service.saveSite(1, c);
    closing.withArray("iconKeys").add("unknown-icon");
    assertThatThrownBy(() -> service.saveSite(2, c))
        .isInstanceOfSatisfying(
            cn.jingxi.content.ApiException.class, e -> assertThat(e.status).isEqualTo(422));
  }
}
