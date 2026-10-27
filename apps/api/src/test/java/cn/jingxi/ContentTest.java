package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import cn.jingxi.content.PortfolioService;
import cn.jingxi.store.JsonStore;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class ContentTest {
  static final ObjectMapper M = new ObjectMapper();
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

  ObjectNode content(ObjectNode w) {
    return (ObjectNode) w.path("draft").path("content").deepCopy();
  }

  ObjectNode image(String id, String asset) {
    return M.createObjectNode()
        .put("id", id)
        .put("type", "image")
        .put("assetId", asset)
        .put("alt", "替代文字")
        .put("caption", "");
  }

  void asset(String id, int width, int height) {
    store.mutate(
        s -> {
          var a = s.withArray("assets").addObject();
          a.put("id", id)
              .put("publicToken", "token-" + id)
              .put("width", width)
              .put("height", height);
          a.putArray("displayImages")
              .addObject()
              .put("size", 480)
              .put("width", width)
              .put("height", height)
              .put("path", "images/display/" + id + "/480.png")
              .put("mimeType", "image/png");
        });
  }

  ObjectNode ready(String slug) {
    asset("a" + slug, 1200, 800);
    var w = service.createWork();
    var c = content(w);
    c.put("title", "作品 " + slug).put("slug", slug);
    c.withArray("blocks").add(image("i" + slug, "a" + slug));
    return service.save(w.path("id").asText(), 1, c);
  }

  @Test
  void defaultsAndDraftSavesNeverPublish() {
    var w = service.createWork();
    assertThat(w).isNotNull();
    assertThat(w.path("draftRevision").asInt()).isEqualTo(1);
    assertThat(w.path("visible").asBoolean()).isFalse();
    var c = content(w).put("title", "私密草稿");
    var saved = service.save(w.path("id").asText(), 1, c);
    assertThat(saved.path("draftRevision").asInt()).isEqualTo(2);
    assertThat(service.catalog().path("orderedPublicKeys")).isEmpty();
    assertThatThrownBy(() -> service.save(w.path("id").asText(), 1, c))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void firstImageMovesAheadOfExistingTextAndGetsPixelCorrectCrop() {
    asset("wide", 1600, 800);
    var w = service.createWork();
    var c = content(w);
    c.withArray("blocks").addObject().put("id", "text").put("type", "text").put("text", "正文");
    c.withArray("blocks").add(image("pic", "wide"));
    var saved = service.save(w.path("id").asText(), 1, c);
    var s = content(saved);
    assertThat(s.path("blocks").get(0).path("id").asText()).isEqualTo("pic");
    assertThat(s.path("coverImageId").asText()).isEqualTo("pic");
    assertThat(s.path("coverCrop").path("width").asDouble()).isEqualTo(.375);
  }

  @Test
  void replacingCoverAcrossAspectRatiosResetsCrop() {
    var w = ready("cross");
    asset("tall", 400, 1200);
    var c = content(w);
    ((ObjectNode) c.withArray("blocks").get(0)).put("assetId", "tall");
    c.putObject("coverCrop").put("x", .1).put("y", .1).put("width", .5).put("height", .5);
    var saved = service.save(w.path("id").asText(), 2, c);
    assertThat(content(saved).path("coverCrop").path("height").asDouble())
        .isCloseTo(4d / 9d, within(.000001));
    assertThat(content(saved).path("coverFocal").path("x").asDouble()).isEqualTo(.5);
  }

  @Test
  void deletingCoverPromotesFirstRemainingImage() {
    var w = ready("delete");
    asset("second", 600, 600);
    var c = content(w);
    c.withArray("blocks").addObject().put("id", "t").put("type", "text").put("text", "text");
    c.withArray("blocks").add(image("next", "second"));
    w = service.save(w.path("id").asText(), 2, c);
    c = content(w);
    c.withArray("blocks").remove(0);
    var saved = service.save(w.path("id").asText(), 3, c);
    assertThat(content(saved).path("blocks").get(0).path("id").asText()).isEqualTo("next");
    assertThat(content(saved).path("coverImageId").asText()).isEqualTo("next");
  }

  @Test
  void coverChangeKeepsOtherRelativeOrderAndRejectsPartialSort() {
    var w = ready("order");
    asset("b", 600, 600);
    var c = content(w);
    c.withArray("blocks").addObject().put("id", "t").put("type", "text").put("text", "text");
    c.withArray("blocks").add(image("b", "b"));
    w = service.save(w.path("id").asText(), 2, c);
    var saved = service.cover(w.path("id").asText(), 3, "b");
    assertThat(content(saved).path("blocks").findValuesAsText("id"))
        .containsExactly("b", "iorder", "t");
    String id = w.path("id").asText();
    assertThatThrownBy(() -> service.blockOrder(id, 4, List.of("b", "t")))
        .isInstanceOf(RuntimeException.class);
    assertThatThrownBy(() -> service.blockOrder(id, 4, List.of("t", "b", "iorder")))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void publishedSnapshotIsIsolatedAndOldPublishCannotUndoUnpublish() {
    var w = ready("visible");
    String id = w.path("id").asText();
    w = service.publish(id, 2, w.path("stateRevision").asLong());
    long publishedState = w.path("stateRevision").asLong();
    assertThat(service.publish(id, 2, publishedState - 1).path("stateRevision").asLong())
        .isEqualTo(publishedState);
    var c = content(w).put("title", "未发布改动");
    w = service.save(id, 2, c);
    assertThat(service.detail("visible").path("title").asText()).isEqualTo("作品 visible");
    service.transition(id, w.path("stateRevision").asLong(), "unpublish");
    assertThatThrownBy(() -> service.publish(id, 2, publishedState))
        .isInstanceOf(RuntimeException.class);
    assertThatThrownBy(() -> service.detail("visible")).isInstanceOf(RuntimeException.class);
  }

  @Test
  void recycleRestoreStaysPrivate() {
    var w = ready("recycled");
    String id = w.path("id").asText();
    w = service.publish(id, 2, w.path("stateRevision").asLong());
    w = service.transition(id, w.path("stateRevision").asLong(), "recycle");
    assertThat(w.path("recycledAt").isNull()).isFalse();
    w = service.transition(id, w.path("stateRevision").asLong(), "restore");
    assertThat(w.path("visible").asBoolean()).isFalse();
    assertThat(w.path("recycledAt").isNull()).isTrue();
  }

  @Test
  void twentyFiveCatalogBrowseUsesStableKeysAndFiltersUnpublished() {
    List<String> ids = new ArrayList<>();
    for (int i = 0; i < 25; i++) {
      var w = ready("work-" + i);
      ids.add(w.path("id").asText());
      service.publish(ids.get(i), 2, w.path("stateRevision").asLong());
    }
    var catalog = service.catalog();
    assertThat(catalog.path("orderedPublicKeys").size()).isEqualTo(25);
    var req = M.createObjectNode().put("take", 12);
    req.set("orderedPublicKeys", catalog.path("orderedPublicKeys"));
    assertThat(service.browse(req).path("items").size()).isEqualTo(12);
    assertThat(service.browse(req).path("hasMore").asBoolean()).isTrue();
    req.put("take", 24);
    assertThat(service.browse(req).path("items").size()).isEqualTo(24);
    req.put("take", 36);
    assertThat(service.browse(req).path("items").size()).isEqualTo(25);
    var first = service.work(ids.get(0));
    service.transition(ids.get(0), first.path("stateRevision").asLong(), "unpublish");
    assertThat(service.browse(req).path("total").asInt()).isEqualTo(24);
    assertThat(service.browse(req).toString())
        .doesNotContain("assetId", "originalPath", "draftRevision");
  }

  @Test
  void globalOrderRequiresCompleteVisibleSet() {
    var w = ready("sort");
    service.publish(w.path("id").asText(), 2, w.path("stateRevision").asLong());
    long revision = service.order().path("catalogRevision").asLong();
    assertThatThrownBy(() -> service.order(List.of(), revision))
        .isInstanceOf(RuntimeException.class);
    assertThat(service.order(List.of(w.path("id").asText()), revision).path("workIds").size())
        .isEqualTo(1);
  }

  @Test
  void missingReferencedAssetsAreValidationErrors() {
    var w = service.createWork();
    var c = content(w);
    c.withArray("blocks").add(image("unknown", "missing"));
    assertThatThrownBy(() -> service.save(w.path("id").asText(), 1, c))
        .isInstanceOfSatisfying(
            cn.jingxi.content.ApiException.class, e -> assertThat(e.status).isEqualTo(422));
  }

  @Test
  void relatedWorksUseManualFirstThenVisibleCategoryOrderWithoutDuplicates() {
    List<ObjectNode> rows = new ArrayList<>();
    for (String slug :
        List.of(
            "related-alpha", "related-beta", "related-gamma", "related-delta", "related-epsilon")) {
      var w = ready(slug);
      rows.add(service.publish(w.path("id").asText(), 2, w.path("stateRevision").asLong()));
    }
    var first = rows.getFirst();
    var c = content(first);
    c.withArray("relatedWorkIds").add(rows.get(4).path("id").asText());
    first = service.save(first.path("id").asText(), 2, c);
    service.publish(first.path("id").asText(), 3, first.path("stateRevision").asLong());
    service.transition(
        rows.get(1).path("id").asText(), rows.get(1).path("stateRevision").asLong(), "unpublish");
    assertThat(
            java.util.stream.StreamSupport.stream(
                    service.detail("related-alpha").path("relatedWorks").spliterator(), false)
                .map(n -> n.path("slug").asText())
                .toList())
        .containsExactly("related-epsilon", "related-gamma", "related-delta");
  }

  @Test
  void publicDetailIncludesPublishedClientAndRole() {
    var w = ready("detail-fields");
    var c = content(w);
    c.put("client", "客户A").put("role", "品牌设计");
    w = service.save(w.path("id").asText(), 2, c);
    service.publish(w.path("id").asText(), 3, w.path("stateRevision").asLong());
    assertThat(service.detail("detail-fields").path("client").asText()).isEqualTo("客户A");
    assertThat(service.detail("detail-fields").path("role").asText()).isEqualTo("品牌设计");
  }

  @Test
  void unknownRelatedDraftReferencesCannotCreateUnrestartableStore() {
    var w = service.createWork();
    var c = content(w);
    c.withArray("relatedWorkIds").add("missing-work");
    assertThatThrownBy(() -> service.save(w.path("id").asText(), 1, c))
        .isInstanceOfSatisfying(
            cn.jingxi.content.ApiException.class, e -> assertThat(e.status).isEqualTo(422));
  }

  @Test
  void idempotentPublishDoesNotRewriteStore() {
    var w = ready("idempotent");
    w = service.publish(w.path("id").asText(), 2, w.path("stateRevision").asLong());
    long before = store.snapshot().path("dataRevision").asLong();
    service.publish(w.path("id").asText(), 2, w.path("stateRevision").asLong());
    assertThat(store.snapshot().path("dataRevision").asLong()).isEqualTo(before);
  }
}
