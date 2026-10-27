package cn.jingxi.content;

import static cn.jingxi.content.ApiException.*;

import cn.jingxi.store.JsonStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/** Content transactions always operate on a detached store copy, then commit once. */
public class PortfolioService {
  private final JsonStore store;

  public PortfolioService(JsonStore store) {
    this.store = store;
  }

  public static ObjectNode object() {
    return JsonStore.JSON.createObjectNode();
  }

  static String now() {
    return Instant.now().toString();
  }

  static String id() {
    return UUID.randomUUID().toString();
  }

  static ObjectNode find(JsonNode rows, String id) {
    for (var row : rows) if (row.path("id").asText().equals(id)) return (ObjectNode) row;
    throw missing();
  }

  static ObjectNode reference(JsonNode rows, String id) {
    try {
      return find(rows, id);
    } catch (ApiException ex) {
      if (ex.status == 404) throw invalid("引用的资源不存在");
      throw ex;
    }
  }

  static ObjectNode content(JsonNode work) {
    return (ObjectNode) work.path("draft").path("content");
  }

  private ObjectNode transaction(
      Consumer<ObjectNode> action, java.util.function.Function<ObjectNode, ObjectNode> result) {
    return result.apply(store.mutate(action));
  }

  public ObjectNode createWork() {
    String wid = id();
    return transaction(
        s -> {
          var w = s.withArray("works").addObject();
          String time = now();
          w.put("id", wid)
              .put("publicKey", id())
              .putNull("lockedSlug")
              .put("draftRevision", 1)
              .put("stateRevision", 1)
              .putNull("published")
              .put("visible", false)
              .putNull("sortOrder")
              .putNull("recycledAt")
              .putNull("lastPublishedAt")
              .put("createdAt", time)
              .put("updatedAt", time);
          var c = w.putObject("draft").putObject("content");
          c.put("title", "")
              .put("slug", "")
              .put("categoryId", "category-other")
              .put("summary", "")
              .put("client", "")
              .putNull("year")
              .put("role", "")
              .putNull("coverImageId")
              .putNull("coverCrop")
              .putNull("coverFocal");
          c.putArray("blocks");
          c.putArray("relatedWorkIds");
        },
        s -> find(s.path("works"), wid));
  }

  public ObjectNode work(String id) {
    return find(store.snapshot().path("works"), id);
  }

  public ObjectNode listWorks(String q, String category, String state, int page) {
    var out = object();
    var rows = out.putArray("items");
    List<JsonNode> matching = new ArrayList<>();
    for (var w : store.snapshot().path("works")) {
      boolean recycled = !w.path("recycledAt").isNull();
      if ("recycled".equals(state) != recycled) continue;
      if ("published".equals(state) && !w.path("visible").asBoolean()) continue;
      if ("draft".equals(state) && !w.path("published").isNull()) continue;
      if ("unpublished".equals(state)
          && (w.path("published").isNull() || w.path("visible").asBoolean())) continue;
      if (category != null
          && !category.isBlank()
          && !content(w).path("categoryId").asText().equals(category)) continue;
      if (q != null
          && !content(w)
              .path("title")
              .asText()
              .toLowerCase(Locale.ROOT)
              .contains(q.toLowerCase(Locale.ROOT))) continue;
      matching.add(w);
    }
    int p = Math.max(1, page);
    matching.stream().skip((long) (p - 1) * 20).limit(20).forEach(rows::add);
    return out.put("total", matching.size()).put("page", p).put("pageSize", 20);
  }

  public ObjectNode save(String id, long revision, ObjectNode input) {
    return transaction(
        s -> {
          var w = find(s.path("works"), id);
          revision(w.path("draftRevision").asLong(), revision);
          if (!w.path("recycledAt").isNull()) throw invalid("请先恢复作品");
          ObjectNode c = normalize(s, w, input.deepCopy());
          w.putObject("draft").set("content", c);
          advance(w, true);
        },
        s -> find(s.path("works"), id));
  }

  private void advance(ObjectNode w, boolean draft) {
    w.put("stateRevision", w.path("stateRevision").asLong() + 1).put("updatedAt", now());
    if (draft) w.put("draftRevision", w.path("draftRevision").asLong() + 1);
  }

  private ObjectNode normalize(ObjectNode s, ObjectNode w, ObjectNode c) {
    ObjectNode old = content(w);
    for (String field : List.of("title", "slug", "summary", "client", "role"))
      if (!c.has(field)) c.put(field, "");
    if (!c.has("year")) c.putNull("year");
    if (!c.has("categoryId")) c.put("categoryId", "category-other");
    if (!c.has("relatedWorkIds")) c.putArray("relatedWorkIds");
    if (!c.has("blocks")) c.putArray("blocks");
    if (!c.path("blocks").isArray() || c.path("blocks").size() > 30) throw invalid("内容最多30块");
    var cat = reference(s.path("categories"), c.path("categoryId").asText());
    if (!cat.path("deletedAt").isNull()
        || (!cat.path("enabled").asBoolean()
            && !old.path("categoryId").equals(c.path("categoryId")))) throw invalid("分类不可用");
    lengths(c, "title", 60);
    lengths(c, "summary", 200);
    lengths(c, "client", 60);
    lengths(c, "role", 100);
    if (!c.path("year").isNull()
        && (c.path("year").asInt() < 1900 || c.path("year").asInt() > Year.now().getValue() + 1))
      throw invalid("年份范围错误");
    if (!w.path("lockedSlug").isNull() && !w.path("lockedSlug").equals(c.path("slug")))
      throw invalid("首次发布后不能更改访问标识");
    Set<String> ids = new HashSet<>();
    List<JsonNode> blocks = new ArrayList<>();
    List<JsonNode> images = new ArrayList<>();
    for (var raw : c.path("blocks")) {
      if (!(raw instanceof ObjectNode b)) throw invalid("内容块格式错误");
      if (!b.hasNonNull("id") || b.path("id").asText().isBlank()) b.put("id", id());
      if (!ids.add(b.path("id").asText())) throw invalid("内容块编号重复");
      if ("image".equals(b.path("type").asText())) {
        reference(s.path("assets"), b.path("assetId").asText());
        if (!b.has("alt")) b.put("alt", c.path("title").asText());
        if (!b.has("caption")) b.put("caption", "");
        lengths(b, "alt", 200);
        lengths(b, "caption", 200);
        if (b.has("text")) throw invalid("图片块不能带正文");
        images.add(b);
      } else if ("text".equals(b.path("type").asText())) {
        lengths(b, "text", 3000);
      } else throw invalid("未知内容块类型");
      blocks.add(b);
    }
    String requested = c.path("coverImageId").asText("");
    JsonNode cover =
        images.stream()
            .filter(b -> b.path("id").asText().equals(requested))
            .findFirst()
            .orElse(images.isEmpty() ? null : images.getFirst());
    if (cover == null) {
      c.putNull("coverImageId").putNull("coverCrop").putNull("coverFocal");
    } else {
      c.put("coverImageId", cover.path("id").asText());
      blocks.remove(cover);
      blocks.addFirst(cover);
      String oldAsset = "";
      for (var b : old.path("blocks"))
        if (b.path("id").equals(old.path("coverImageId"))) oldAsset = b.path("assetId").asText();
      if (!old.path("coverImageId").equals(c.path("coverImageId"))
          || !oldAsset.equals(cover.path("assetId").asText())
          || !c.path("coverCrop").isObject()) {
        crop(c, reference(s.path("assets"), cover.path("assetId").asText()));
      }
      validateCrop(c, reference(s.path("assets"), cover.path("assetId").asText()));
    }
    var ordered = c.putArray("blocks");
    int index = 1;
    for (var b : blocks) {
      ((ObjectNode) b).put("sortOrder", index++);
      ordered.add(b);
    }
    Set<String> related = new HashSet<>();
    if (!c.path("relatedWorkIds").isArray() || c.path("relatedWorkIds").size() > 3)
      throw invalid("关联作品最多3项");
    for (var r : c.path("relatedWorkIds")) {
      if (r.asText().equals(w.path("id").asText()) || !related.add(r.asText()))
        throw invalid("关联作品重复或包含自身");
      reference(s.path("works"), r.asText());
    }
    return c;
  }

  static void lengths(JsonNode c, String field, int max) {
    String value = c.path(field).asText("");
    long count = Pattern.compile("\\X").matcher(value).results().count();
    if (count > max) throw invalid(field + "超过长度限制");
  }

  private void crop(ObjectNode c, JsonNode a) {
    double r = a.path("width").asDouble() / a.path("height").asDouble(),
        target = .75,
        cw = r >= target ? target / r : 1,
        ch = r >= target ? 1 : r / target;
    c.putObject("coverCrop")
        .put("x", (1 - cw) / 2)
        .put("y", (1 - ch) / 2)
        .put("width", cw)
        .put("height", ch);
    c.putObject("coverFocal").put("x", .5).put("y", .5);
  }

  private void validateCrop(ObjectNode c, JsonNode a) {
    var crop = c.path("coverCrop");
    double x = crop.path("x").asDouble(-1),
        y = crop.path("y").asDouble(-1),
        w = crop.path("width").asDouble(-1),
        h = crop.path("height").asDouble(-1);
    if (x < 0
        || y < 0
        || w <= 0
        || h <= 0
        || x + w > 1.000001
        || y + h > 1.000001
        || Math.abs(w * a.path("width").asDouble() / (h * a.path("height").asDouble()) - .75) > .01)
      throw invalid("首图裁剪必须为3:4且在图片范围内");
    for (String key : List.of("x", "y")) {
      double f = c.path("coverFocal").path(key).asDouble(-1);
      if (f < 0 || f > 1) throw invalid("焦点超出范围");
    }
  }

  public ObjectNode cover(String id, long revision, String imageId) {
    var w = work(id);
    var c = content(w).deepCopy();
    boolean valid = false;
    for (var b : c.path("blocks"))
      if (b.path("id").asText().equals(imageId) && b.path("type").asText().equals("image"))
        valid = true;
    if (!valid) throw invalid("首图必须是当前作品图片");
    c.put("coverImageId", imageId);
    return save(id, revision, c);
  }

  public ObjectNode blockOrder(String id, long revision, List<String> ids) {
    var w = work(id);
    var c = content(w).deepCopy();
    Map<String, JsonNode> blocks = new LinkedHashMap<>();
    c.path("blocks").forEach(b -> blocks.put(b.path("id").asText(), b));
    if (ids.size() != blocks.size()
        || new HashSet<>(ids).size() != ids.size()
        || !blocks.keySet().equals(new HashSet<>(ids))
        || (!c.path("coverImageId").isNull()
            && !ids.getFirst().equals(c.path("coverImageId").asText())))
      throw invalid("排序必须包含全部内容且首图固定第一");
    var list = c.putArray("blocks");
    ids.forEach(i -> list.add(blocks.get(i)));
    return save(id, revision, c);
  }

  public ObjectNode publish(String id, long draft, long state) {
    return transaction(
        s -> {
          var w = find(s.path("works"), id);
          if (w.path("visible").asBoolean()
              && w.path("published").path("sourceDraftRevision").asLong() == draft) return;
          revision(w.path("stateRevision").asLong(), state);
          revision(w.path("draftRevision").asLong(), draft);
          if (!w.path("recycledAt").isNull()) throw invalid("回收作品不能发布");
          var c = content(w);
          if (c.path("title").asText().isBlank()
              || !c.path("slug").asText().matches("[a-z0-9]+(?:-[a-z0-9]+)*")
              || c.path("slug").asText().length() < 3
              || c.path("slug").asText().length() > 80
              || c.path("coverImageId").isNull()) throw invalid("发布需要标题、合法访问标识和首图");
          for (var other : s.path("works"))
            if (!other.path("id").asText().equals(id)
                && other.path("lockedSlug").asText().equals(c.path("slug").asText()))
              throw invalid("访问标识已使用");
          for (var b : c.path("blocks"))
            if (b.path("type").asText().equals("image") && b.path("alt").asText().isBlank())
              throw invalid("图片替代文字必填");
          for (var related : c.path("relatedWorkIds"))
            if (!visible(reference(s.path("works"), related.asText()))) throw invalid("关联作品尚未公开");
          if (w.path("published").path("sourceDraftRevision").asLong() != draft) {
            int version = w.path("published").path("version").asInt() + 1;
            var p = w.putObject("published");
            p.put("version", version)
                .put("sourceDraftRevision", draft)
                .put("publishedAt", now())
                .set("content", c.deepCopy());
          }
          w.put("lockedSlug", c.path("slug").asText()).put("lastPublishedAt", now());
          if (!w.path("visible").asBoolean()) {
            w.put("sortOrder", visibleWorks(s).size() + 1);
            bumpCatalog(s);
          }
          w.put("visible", true);
          advance(w, false);
        },
        s -> find(s.path("works"), id));
  }

  static boolean visible(JsonNode w) {
    return w.path("visible").asBoolean()
        && !w.path("published").isNull()
        && w.path("recycledAt").isNull();
  }

  static List<JsonNode> visibleWorks(ObjectNode s) {
    List<JsonNode> rows = new ArrayList<>();
    for (var w : s.path("works")) if (visible(w)) rows.add(w);
    rows.sort(Comparator.comparingInt(w -> w.path("sortOrder").asInt()));
    return rows;
  }

  static void bumpCatalog(ObjectNode s) {
    var site = (ObjectNode) s.path("site");
    site.put("catalogRevision", site.path("catalogRevision").asLong() + 1);
  }

  public ObjectNode transition(String id, long state, String action) {
    return transaction(
        s -> {
          var w = find(s.path("works"), id);
          revision(w.path("stateRevision").asLong(), state);
          boolean wasVisible = visible(w);
          switch (action) {
            case "unpublish" -> {}
            case "recycle" -> w.put("recycledAt", now());
            case "restore" -> w.putNull("recycledAt");
            default -> throw invalid("未知状态操作");
          }
          w.put("visible", false).putNull("sortOrder");
          advance(w, false);
          if (wasVisible) {
            int i = 1;
            for (var other : visibleWorks(s)) ((ObjectNode) other).put("sortOrder", i++);
            bumpCatalog(s);
          }
        },
        s -> find(s.path("works"), id));
  }

  public ObjectNode order() {
    return orderDto(store.snapshot());
  }

  private ObjectNode orderDto(ObjectNode s) {
    var o = object().put("catalogRevision", s.path("site").path("catalogRevision").asLong());
    var list = o.putArray("workIds");
    visibleWorks(s).forEach(w -> list.add(w.path("id").asText()));
    return o;
  }

  public ObjectNode order(List<String> ids, long revision) {
    return transaction(
        s -> {
          revision(s.path("site").path("catalogRevision").asLong(), revision);
          var rows = visibleWorks(s);
          Set<String> existing = new HashSet<>();
          rows.forEach(w -> existing.add(w.path("id").asText()));
          if (ids.size() != existing.size()
              || new HashSet<>(ids).size() != ids.size()
              || !existing.equals(new HashSet<>(ids))) throw invalid("请提交全部公开作品顺序");
          int i = 1;
          for (String id : ids) find(s.path("works"), id).put("sortOrder", i++);
          bumpCatalog(s);
        },
        this::orderDto);
  }

  public ObjectNode catalog() {
    var s = store.snapshot();
    var out = object().put("catalogRevision", s.path("site").path("catalogRevision").asLong());
    var keys = out.putArray("orderedPublicKeys");
    visibleWorks(s).forEach(w -> keys.add(w.path("publicKey").asText()));
    out.set("categories", publicCategories(s));
    return out;
  }

  private ArrayNode publicCategories(ObjectNode s) {
    var list = JsonStore.JSON.createArrayNode();
    List<JsonNode> cats = new ArrayList<>();
    s.path("categories")
        .forEach(
            c -> {
              if (c.path("deletedAt").isNull()) cats.add(c);
            });
    cats.sort(Comparator.comparingInt(c -> c.path("sortOrder").asInt()));
    for (var c : cats)
      list.addObject().put("slug", c.path("slug").asText()).put("name", c.path("name").asText());
    return list;
  }

  public ObjectNode browse(ObjectNode request) {
    int take = request.path("take").asInt(12);
    if (take < 12
        || take > 1200
        || take % 12 != 0
        || !request.path("orderedPublicKeys").isArray()
        || request.path("orderedPublicKeys").size() > 5000) throw invalid("浏览参数错误");
    var s = store.snapshot();
    Map<String, JsonNode> available = new HashMap<>();
    visibleWorks(s).forEach(w -> available.put(w.path("publicKey").asText(), w));
    var out = object();
    var items = out.putArray("items");
    var counts = out.putObject("categoryCounts");
    Set<String> seen = new HashSet<>();
    int total = 0;
    for (var key : request.path("orderedPublicKeys")) {
      var w = available.get(key.asText());
      if (w == null || !seen.add(key.asText())) continue;
      var c =
          find(
              s.path("categories"),
              w.path("published").path("content").path("categoryId").asText());
      String slug = c.path("slug").asText();
      counts.put(slug, counts.path(slug).asInt() + 1);
      if (request.hasNonNull("categorySlug")
          && !request.path("categorySlug").asText().isBlank()
          && !request.path("categorySlug").asText().equals(slug)) continue;
      total++;
      if (items.size() < take) items.add(card(s, w, false));
    }
    return out.put("total", total).put("hasMore", total > items.size());
  }

  public ObjectNode detail(String slug) {
    var s = store.snapshot();
    for (var w : s.path("works"))
      if (visible(w) && w.path("lockedSlug").asText().equals(slug)) return detailDto(s, w, false);
    throw missing();
  }

  public ObjectNode previewWork(String id, long revision) {
    var s = store.snapshot();
    var w = find(s.path("works"), id);
    revision(w.path("draftRevision").asLong(), revision);
    return detailDto(s, w, true);
  }

  private ObjectNode card(ObjectNode s, JsonNode w, boolean preview) {
    var c = preview ? content(w) : w.path("published").path("content");
    var o = object();
    for (String f : List.of("publicKey")) o.set(f, w.path(f));
    for (String f : List.of("title", "slug", "summary", "year")) o.set(f, c.path(f));
    var cat = find(s.path("categories"), c.path("categoryId").asText());
    o.putObject("category")
        .put("slug", cat.path("slug").asText())
        .put("name", cat.path("name").asText());
    for (var b : c.path("blocks"))
      if (b.path("id").equals(c.path("coverImageId"))) {
        var image = image(s, b.path("assetId").asText(), preview);
        image.put("alt", b.path("alt").asText());
        image.set("crop", c.path("coverCrop"));
        image.set("focal", c.path("coverFocal"));
        o.set("cover", image);
        break;
      }
    return o;
  }

  private ObjectNode detailDto(ObjectNode s, JsonNode w, boolean preview) {
    var out = card(s, w, preview);
    var c = preview ? content(w) : w.path("published").path("content");
    var blocks = out.putArray("blocks");
    for (var b : c.path("blocks")) {
      var block = blocks.addObject();
      for (String field : List.of("id", "type", "sortOrder")) block.set(field, b.path(field));
      if (b.path("type").asText().equals("image")) {
        block.set("image", image(s, b.path("assetId").asText(), preview));
        block.put("alt", b.path("alt").asText()).put("caption", b.path("caption").asText());
      } else block.put("text", b.path("text").asText());
    }
    out.put("client", c.path("client").asText()).put("role", c.path("role").asText());
    var related = out.putArray("relatedWorks");
    Set<String> selected = new HashSet<>();
    selected.add(w.path("id").asText());
    for (var rid : c.path("relatedWorkIds")) {
      for (var other : s.path("works"))
        if (other.path("id").equals(rid)
            && visible(other)
            && related.size() < 3
            && selected.add(other.path("id").asText())) related.add(card(s, other, false));
    }
    for (var other : visibleWorks(s)) {
      if (related.size() == 3) break;
      if (other.path("published").path("content").path("categoryId").equals(c.path("categoryId"))
          && selected.add(other.path("id").asText())) related.add(card(s, other, false));
    }
    return out;
  }

  public ObjectNode image(ObjectNode s, String assetId, boolean preview) {
    var a = find(s.path("assets"), assetId);
    if (a.path("displayImages").isEmpty()) throw missing();
    JsonNode display = a.path("displayImages").get(a.path("displayImages").size() - 1);
    String url =
        preview
            ? "/api/admin/v1/assets/" + assetId + "/image/" + display.path("size").asInt()
            : "/media/" + a.path("publicToken").asText() + "/" + display.path("size").asInt();
    return object()
        .put("url", url)
        .put("width", display.path("width").asInt())
        .put("height", display.path("height").asInt());
  }

  public boolean isPublicAsset(ObjectNode s, String assetId) {
    for (var w : s.path("works"))
      if (visible(w) && references(w.path("published").path("content"), "assetId", assetId))
        return true;
    var p = s.path("site").path("published").path("content");
    return references(p, "assetId", assetId)
        || references(p, "logoAssetId", assetId)
        || references(p, "mainAssetId", assetId);
  }

  static boolean references(JsonNode node, String field, String value) {
    if (node.isObject()) {
      if (node.path(field).asText().equals(value)) return true;
      for (var child : node) if (references(child, field, value)) return true;
    } else if (node.isArray())
      for (var child : node) if (references(child, field, value)) return true;
    return false;
  }

  public ObjectNode categories() {
    var s = store.snapshot();
    var out = object();
    var items = out.putArray("items");
    for (var raw : s.path("categories")) {
      if (!raw.path("deletedAt").isNull()) continue;
      var c = raw.deepCopy();
      String id = c.path("id").asText();
      int draft = 0, published = 0;
      for (var w : s.path("works")) {
        if (content(w).path("categoryId").asText().equals(id)) draft++;
        if (visible(w)
            && w.path("published").path("content").path("categoryId").asText().equals(id))
          published++;
      }
      ((ObjectNode) c)
          .put("draftReferenceCount", draft)
          .put("publishedReferenceCount", published)
          .put("siteReferenceCount", siteCategoryReferences(s, id));
      items.add(c);
    }
    return out;
  }

  private int siteCategoryReferences(ObjectNode s, String id) {
    int count = 0;
    for (var config :
        List.of(
            s.path("site").path("draft").path("content"),
            s.path("site").path("published").path("content")))
      for (var cid : config.path("homepage").path("categories").path("categoryIds"))
        if (cid.asText().equals(id)) count++;
    return count;
  }

  private String cleanName(String name) {
    String clean =
        java.text.Normalizer.normalize(
            name == null ? "" : name.trim(), java.text.Normalizer.Form.NFKC);
    if (clean.isBlank()) throw invalid("分类名必填");
    lengths(object().put("name", clean), "name", 20);
    return clean;
  }

  public ObjectNode createCategory(String name, String slug) {
    String cid = id(), clean = cleanName(name);
    if (slug == null || !slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || slug.length() > 80)
      throw invalid("分类访问标识格式错误");
    return transaction(
        s -> {
          for (var c : s.path("categories"))
            if (c.path("name").asText().equalsIgnoreCase(clean)
                || c.path("slug").asText().equals(slug)) throw invalid("分类名称或标识已使用");
          String time = now();
          s.withArray("categories")
              .addObject()
              .put("id", cid)
              .put("name", clean)
              .put("slug", slug)
              .put("sortOrder", s.path("categories").size() + 1)
              .put("enabled", true)
              .put("system", false)
              .put("revision", 1)
              .putNull("deletedAt")
              .put("createdAt", time)
              .put("updatedAt", time);
        },
        s -> find(s.path("categories"), cid));
  }

  public ObjectNode updateCategory(String id, ObjectNode input) {
    return transaction(
        s -> {
          var c = find(s.path("categories"), id);
          revision(c.path("revision").asLong(), input.path("expectedRevision").asLong());
          if (!c.path("deletedAt").isNull()) throw missing();
          String name = cleanName(input.path("name").asText());
          if (c.path("system").asBoolean()
              && (!input.path("enabled").asBoolean() || !name.equals(c.path("name").asText())))
            throw invalid("系统其他分类受保护");
          for (var other : s.path("categories"))
            if (!other.path("id").asText().equals(id)
                && other.path("name").asText().equalsIgnoreCase(name)) throw invalid("分类名称已使用");
          int order = input.path("sortOrder").asInt();
          if (order < 1 || order > s.path("categories").size()) throw invalid("分类顺序错误");
          int oldOrder = c.path("sortOrder").asInt();
          for (var other : s.path("categories")) {
            if (other == c) continue;
            var cat = (ObjectNode) other;
            int old = cat.path("sortOrder").asInt();
            if (order < oldOrder && old >= order && old < oldOrder) cat.put("sortOrder", old + 1);
            if (order > oldOrder && old > oldOrder && old <= order) cat.put("sortOrder", old - 1);
          }
          c.put("name", name)
              .put("enabled", input.path("enabled").asBoolean())
              .put("sortOrder", order)
              .put("revision", c.path("revision").asLong() + 1)
              .put("updatedAt", now());
        },
        s -> find(s.path("categories"), id));
  }

  public ObjectNode deleteCategory(String id, long revision) {
    return transaction(
        s -> {
          var c = find(s.path("categories"), id);
          revision(c.path("revision").asLong(), revision);
          if (c.path("system").asBoolean()) throw invalid("系统分类不能删除");
          for (var w : s.path("works"))
            if (content(w).path("categoryId").asText().equals(id)
                || (visible(w)
                    && w.path("published").path("content").path("categoryId").asText().equals(id)))
              throw invalid("分类仍被作品引用");
          if (siteCategoryReferences(s, id) > 0) throw invalid("分类仍被网站配置引用");
          c.put("deletedAt", now()).put("enabled", false).put("revision", revision + 1);
        },
        s -> object().put("deleted", true));
  }

  public ObjectNode migrateCategory(String id, ObjectNode input) {
    String target = input.path("targetCategoryId").asText();
    return transaction(
        s -> {
          find(s.path("categories"), id);
          var cat = find(s.path("categories"), target);
          if (id.equals(target)
              || !cat.path("enabled").asBoolean()
              || !cat.path("deletedAt").isNull()) throw invalid("迁移目标分类不可用");
          Set<String> seen = new HashSet<>();
          for (var selected : input.path("works")) {
            String wid = selected.path("id").asText();
            if (!seen.add(wid)) throw invalid("重复作品");
            var w = find(s.path("works"), wid);
            revision(
                w.path("draftRevision").asLong(), selected.path("expectedDraftRevision").asLong());
            if (!content(w).path("categoryId").asText().equals(id)) throw invalid("作品不属于此分类");
            content(w).put("categoryId", target);
            advance(w, true);
          }
        },
        s -> object().put("updated", input.path("works").size()));
  }

  public ObjectNode siteDraft() {
    return (ObjectNode) store.snapshot().path("site");
  }

  public ObjectNode saveSite(long revision, ObjectNode input) {
    return transaction(
        s -> {
          var site = (ObjectNode) s.path("site");
          revision(site.path("draftRevision").asLong(), revision);
          validateSite(s, input, site.path("draft").path("content"));
          site.putObject("draft").set("content", input.deepCopy());
          site.put("draftRevision", revision + 1)
              .put("stateRevision", site.path("stateRevision").asLong() + 1)
              .put("updatedAt", now());
        },
        s -> (ObjectNode) s.path("site"));
  }

  private void validateSite(ObjectNode s, ObjectNode c, JsonNode old) {
    if (!c.path("brand").isObject()
        || !c.path("about").isObject()
        || !c.path("contact").isObject()
        || !c.path("homepage").isObject()
        || c.path("brand").path("name").asText().isBlank()) throw invalid("网站配置不完整");
    lengths(c.path("brand"), "name", 30);
    Set<String> assetIds = new HashSet<>();
    collectAssetIds(c, assetIds);
    for (String aid : assetIds) reference(s.path("assets"), aid);
    if (c.path("about").path("teamImages").size() > 6 || c.path("contact").path("links").size() > 5)
      throw invalid("网站图片或联系链接超限");
    for (var link : c.path("contact").path("links")) validateHttps(link.path("url").asText());
    var h = c.path("homepage");
    for (String required : List.of("hero", "featured", "closing"))
      if (!h.path(required).path("enabled").asBoolean()) throw invalid("必选首页区块不能关闭");
    checkArray(h.path("hero"), "workIds", 8);
    checkArray(h.path("featured"), "workIds", 5);
    checkArray(h.path("gallery"), "workIds", 16);
    checkArray(h.path("statement"), "decorationWorkIds", 3);
    checkArray(h.path("categories"), "categoryIds", 4);
    checkArray(h.path("cases"), "items", 3);
    checkArray(h.path("capabilities"), "items", 3);
    checkArray(h.path("banner"), "logos", 12);
    checkArray(h.path("closing"), "iconKeys", 8);
    for (var icon : h.path("closing").path("iconKeys"))
      if (!java.util.Set.of("star", "circle", "diamond", "wave", "flower", "arrow")
          .contains(icon.asText())) throw invalid("未知的装饰图标");
    lengths(h.path("hero"), "title", 40);
    lengths(h.path("hero"), "description", 120);
    lengths(h.path("statement"), "text", 120);
    for (var cap : h.path("capabilities").path("items")) {
      lengths(cap, "title", 20);
      lengths(cap, "description", 100);
    }
    for (var item : h.path("cases").path("items")) lengths(item, "summaryOverride", 80);
    for (var logo : h.path("banner").path("logos"))
      if (logo.hasNonNull("url") && !logo.path("url").asText().isBlank())
        validateHttps(logo.path("url").asText());
    for (var cid : h.path("categories").path("categoryIds")) {
      var cat = reference(s.path("categories"), cid.asText());
      boolean existed = false;
      for (var oldId : old.path("homepage").path("categories").path("categoryIds"))
        if (oldId.equals(cid)) existed = true;
      if (!cat.path("deletedAt").isNull() || (!cat.path("enabled").asBoolean() && !existed))
        throw invalid("分类不可用");
    }
    validateSiteWorkRefs(s, h);
  }

  private void validateHttps(String url) {
    try {
      var uri = java.net.URI.create(url);
      if (!"https".equals(uri.getScheme()) || uri.getHost() == null) throw invalid("链接只支持HTTPS");
    } catch (IllegalArgumentException e) {
      throw invalid("链接格式错误");
    }
  }

  private void checkArray(JsonNode node, String field, int limit) {
    if (!node.path(field).isArray() || node.path(field).size() > limit)
      throw invalid(field + "数量超限");
    Set<String> ids = new HashSet<>();
    for (var value : node.path(field))
      if (value.isTextual() && !ids.add(value.asText())) throw invalid(field + "包含重复项");
  }

  private void validateSiteWorkRefs(ObjectNode s, JsonNode h) {
    for (String section : List.of("hero", "featured", "gallery", "statement")) {
      String key = section.equals("statement") ? "decorationWorkIds" : "workIds";
      for (var wid : h.path(section).path(key)) reference(s.path("works"), wid.asText());
    }
    for (var item : h.path("cases").path("items"))
      reference(s.path("works"), item.path("workId").asText());
    if (h.path("banner").hasNonNull("linkedWorkId"))
      reference(s.path("works"), h.path("banner").path("linkedWorkId").asText());
  }

  private void collectAssetIds(JsonNode n, Set<String> ids) {
    if (n.isObject()) {
      for (String key : List.of("assetId", "logoAssetId", "mainAssetId"))
        if (n.hasNonNull(key)) ids.add(n.path(key).asText());
      for (var child : n) collectAssetIds(child, ids);
    } else if (n.isArray()) for (var child : n) collectAssetIds(child, ids);
  }

  public ObjectNode publishSite(long draft, long state) {
    return transaction(
        s -> {
          var site = (ObjectNode) s.path("site");
          if (site.path("published").path("sourceDraftRevision").asLong() == draft) return;
          revision(site.path("draftRevision").asLong(), draft);
          revision(site.path("stateRevision").asLong(), state);
          ObjectNode c = (ObjectNode) site.path("draft").path("content");
          validateSite(s, c, c);
          int version = site.path("published").path("version").asInt() + 1;
          site.putObject("published")
              .put("version", version)
              .put("sourceDraftRevision", draft)
              .put("publishedAt", now())
              .set("content", c.deepCopy());
          site.put("stateRevision", state + 1).put("updatedAt", now());
        },
        s -> (ObjectNode) s.path("site"));
  }

  public ObjectNode publicSite() {
    var s = store.snapshot();
    var site = s.path("site");
    JsonNode c =
        site.path("published").isNull()
            ? defaultPublicContent(s)
            : site.path("published").path("content");
    return siteDto(s, c, false, site.path("published").path("version").asInt());
  }

  private JsonNode defaultPublicContent(ObjectNode s) {
    return JsonStore.defaultSiteContent();
  }

  public ObjectNode previewSite(long revision) {
    var s = store.snapshot();
    revision(s.path("site").path("draftRevision").asLong(), revision);
    return siteDto(
        s,
        s.path("site").path("draft").path("content"),
        true,
        s.path("site").path("published").path("version").asInt());
  }

  private ObjectNode siteDto(ObjectNode s, JsonNode c, boolean preview, int version) {
    var out = object().put("siteVersion", version);
    out.set("brand", c.path("brand").deepCopy());
    var brand = (ObjectNode) out.path("brand");
    brand.remove("logoAssetId");
    if (c.path("brand").hasNonNull("logoAssetId"))
      brand.put(
          "logoUrl",
          image(s, c.path("brand").path("logoAssetId").asText(), preview).path("url").asText());
    var about =
        out.putObject("about").put("description", c.path("about").path("description").asText());
    if (c.path("about").hasNonNull("mainAssetId"))
      about.set("mainImage", image(s, c.path("about").path("mainAssetId").asText(), preview));
    var team = about.putArray("teamImages");
    for (var entry : c.path("about").path("teamImages")) {
      var entryDto = team.addObject().put("caption", entry.path("caption").asText());
      entryDto.set("image", image(s, entry.path("assetId").asText(), preview));
    }
    out.set("contact", c.path("contact").deepCopy());
    out.set("categories", publicCategories(s));
    var h = out.putObject("homepage");
    var source = c.path("homepage");
    for (String section :
        List.of(
            "hero",
            "featured",
            "banner",
            "statement",
            "categories",
            "gallery",
            "cases",
            "capabilities",
            "closing")) {
      var block = (ObjectNode) source.path(section).deepCopy();
      h.set(section, block);
      if (List.of("hero", "featured", "gallery", "statement").contains(section)) {
        String key = section.equals("statement") ? "decorationWorkIds" : "workIds";
        var works = block.putArray("works");
        for (var wid : source.path(section).path(key))
          for (var w : s.path("works"))
            if (w.path("id").equals(wid) && visible(w)) works.add(card(s, w, false));
        block.remove(key);
        if (section.equals("hero") || section.equals("featured")) {
          var publicKeys = block.putArray("workIds");
          for (var resolved : works) publicKeys.add(resolved.path("publicKey").asText());
        }
      }
    }
    var banner = (ObjectNode) h.path("banner");
    banner.remove(List.of("assetId", "linkedWorkId"));
    if (source.path("banner").hasNonNull("assetId"))
      banner.set("image", image(s, source.path("banner").path("assetId").asText(), preview));
    var logos = banner.putArray("logos");
    for (var logo : source.path("banner").path("logos")) {
      var entry = logos.addObject();
      entry.set("image", image(s, logo.path("assetId").asText(), preview));
      if (logo.hasNonNull("url") && !logo.path("url").asText().isBlank())
        entry.set("url", logo.path("url"));
    }
    if (source.path("banner").hasNonNull("linkedWorkId"))
      for (var w : s.path("works"))
        if (w.path("id").equals(source.path("banner").path("linkedWorkId")) && visible(w))
          banner.put("linkedWorkSlug", w.path("lockedSlug").asText());
    var cats = (ObjectNode) h.path("categories");
    cats.remove("categoryIds");
    var catItems = cats.putArray("items");
    for (var cid : source.path("categories").path("categoryIds")) {
      var category = find(s.path("categories"), cid.asText());
      if (!category.path("deletedAt").isNull()) continue;
      var item =
          catItems
              .addObject()
              .put("slug", category.path("slug").asText())
              .put("name", category.path("name").asText());
      var works = item.putArray("works");
      for (var w : visibleWorks(s))
        if (w.path("published").path("content").path("categoryId").equals(cid))
          works.add(card(s, w, false));
    }
    var cases = ((ObjectNode) h.path("cases")).putArray("items");
    for (var item : source.path("cases").path("items"))
      for (var w : s.path("works"))
        if (w.path("id").equals(item.path("workId")) && visible(w)) {
          var entry =
              cases.addObject().put("summaryOverride", item.path("summaryOverride").asText());
          entry.set("work", card(s, w, false));
        }
    return out;
  }
}
