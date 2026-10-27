package cn.jingxi.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.function.Consumer;

/** A single writer owns the lock before inspecting data. Readers get detached snapshots. */
public final class JsonStore implements AutoCloseable {
  public static final ObjectMapper JSON = new ObjectMapper();
  private final Path root, file;
  private final FileChannel lockChannel;
  private final FileLock lock;
  private volatile ObjectNode current;

  public JsonStore(Path root) throws Exception {
    this.root = root.toAbsolutePath().normalize();
    Files.createDirectories(this.root.resolve("data"));
    file = this.root.resolve("data/store.json");
    lockChannel =
        FileChannel.open(
            this.root.resolve("data/store.lock"),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE);
    FileLock acquired = null;
    try {
      acquired = lockChannel.tryLock();
      if (acquired == null) throw new IllegalStateException("Storage is already in use");
      lock = acquired;
      if (Files.exists(file)) {
        var parsed = JSON.readTree(Files.readAllBytes(file));
        if (!(parsed instanceof ObjectNode n)) throw new IllegalStateException("Invalid store");
        validate(n);
        validateLoaded(n);
        current = n;
      } else {
        current = defaults();
        persist(current);
      }
    } catch (Exception ex) {
      if (acquired != null) acquired.release();
      lockChannel.close();
      throw ex;
    }
  }

  public Path root() {
    return root;
  }

  public ObjectNode snapshot() {
    return current.deepCopy();
  }

  public synchronized ObjectNode mutate(Consumer<ObjectNode> change) {
    ObjectNode next = current.deepCopy();
    change.accept(next);
    if (next.equals(current)) return current.deepCopy();
    next.put("dataRevision", current.path("dataRevision").asLong() + 1);
    next.put("updatedAt", Instant.now().toString());
    validate(next);
    try {
      persist(next);
    } catch (Exception ex) {
      throw new IllegalStateException("Atomic storage write failed", ex);
    }
    current = next.deepCopy();
    return next.deepCopy();
  }

  private void persist(ObjectNode next) throws Exception {
    Path temp = Files.createTempFile(file.getParent(), "store-", ".tmp");
    try {
      byte[] data = JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(next);
      try (var channel = FileChannel.open(temp, StandardOpenOption.WRITE)) {
        ByteBuffer b = ByteBuffer.wrap(data);
        while (b.hasRemaining()) channel.write(b);
        channel.force(true);
      }
      Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } finally {
      Files.deleteIfExists(temp);
    }
  }

  private static void validate(ObjectNode n) {
    if (n.path("schemaVersion").asInt() != 1
        || !n.path("works").isArray()
        || !n.path("assets").isArray()
        || !n.path("categories").isArray()
        || !n.path("site").isObject()
        || n.path("categories").isEmpty()
        || !n.path("site").path("draft").path("content").isObject())
      throw new IllegalStateException("Invalid store; restore a backup");
  }

  private void validateLoaded(ObjectNode n) {
    java.util.Set<String> categories = ids(n.path("categories")),
        assets = ids(n.path("assets")),
        works = ids(n.path("works"));
    java.util.Set<String> keys = new java.util.HashSet<>(), slugs = new java.util.HashSet<>();
    if (!categories.contains("category-other") || !n.path("dataRevision").canConvertToLong())
      throw new IllegalStateException("Invalid store root");
    for (var asset : n.path("assets")) {
      if (!asset.path("displayImages").isArray() || asset.path("displayImages").isEmpty())
        throw new IllegalStateException("Invalid asset");
      validateStoredPath(asset.path("originalPath").asText(), "images/originals");
      for (var display : asset.path("displayImages"))
        validateStoredPath(display.path("path").asText(), "images/display");
    }
    for (var w : n.path("works")) {
      if (!w.hasNonNull("publicKey")
          || !keys.add(w.path("publicKey").asText())
          || !w.path("draft").path("content").isObject()
          || w.path("draftRevision").asLong() < 1
          || w.path("stateRevision").asLong() < 1) throw new IllegalStateException("Invalid work");
      if (w.hasNonNull("lockedSlug") && !slugs.add(w.path("lockedSlug").asText()))
        throw new IllegalStateException("Duplicate slug");
      checkContent(w.path("draft").path("content"), categories, assets, works);
      if (!w.path("published").isNull())
        checkContent(w.path("published").path("content"), categories, assets, works);
      if (w.path("visible").asBoolean()
          && (w.path("published").isNull() || !w.path("recycledAt").isNull()))
        throw new IllegalStateException("Invalid visibility");
    }
    checkSite(n.path("site").path("draft").path("content"), categories, assets, works);
    if (!n.path("site").path("published").isNull())
      checkSite(n.path("site").path("published").path("content"), categories, assets, works);
  }

  private java.util.Set<String> ids(com.fasterxml.jackson.databind.JsonNode rows) {
    java.util.Set<String> ids = new java.util.HashSet<>();
    for (var row : rows)
      if (!row.hasNonNull("id")
          || row.path("id").asText().isBlank()
          || !ids.add(row.path("id").asText()))
        throw new IllegalStateException("Missing or duplicate id");
    return ids;
  }

  private void checkContent(
      com.fasterxml.jackson.databind.JsonNode c,
      java.util.Set<String> cats,
      java.util.Set<String> assets,
      java.util.Set<String> works) {
    if (!c.isObject()
        || !cats.contains(c.path("categoryId").asText())
        || !c.path("blocks").isArray()) throw new IllegalStateException("Dangling work category");
    int order = 1;
    java.util.Set<String> ids = new java.util.HashSet<>();
    boolean foundCover = c.path("coverImageId").isNull();
    for (var b : c.path("blocks")) {
      if (!ids.add(b.path("id").asText()) || b.path("sortOrder").asInt() != order++)
        throw new IllegalStateException("Invalid block order");
      if (b.path("type").asText().equals("image") && !assets.contains(b.path("assetId").asText()))
        throw new IllegalStateException("Dangling asset");
      if (b.path("id").equals(c.path("coverImageId"))) {
        foundCover = b.path("type").asText().equals("image") && b.path("sortOrder").asInt() == 1;
      }
    }
    if (!foundCover) throw new IllegalStateException("Invalid cover");
    for (var r : c.path("relatedWorkIds"))
      if (!works.contains(r.asText())) throw new IllegalStateException("Dangling related work");
  }

  private void checkSite(
      com.fasterxml.jackson.databind.JsonNode node,
      java.util.Set<String> cats,
      java.util.Set<String> assets,
      java.util.Set<String> works) {
    if (node.isObject()) {
      for (var entry : node.properties()) {
        String key = entry.getKey();
        var value = entry.getValue();
        if (java.util.List.of("assetId", "logoAssetId", "mainAssetId").contains(key)
            && !value.isNull()
            && !assets.contains(value.asText()))
          throw new IllegalStateException("Dangling site asset");
        if (key.equals("categoryIds"))
          for (var id : value)
            if (!cats.contains(id.asText()))
              throw new IllegalStateException("Dangling site category");
        if (java.util.List.of("workIds", "decorationWorkIds").contains(key))
          for (var id : value)
            if (!works.contains(id.asText())) throw new IllegalStateException("Dangling site work");
        if (java.util.List.of("workId", "linkedWorkId").contains(key)
            && !value.isNull()
            && !works.contains(value.asText()))
          throw new IllegalStateException("Dangling site work");
        checkSite(value, cats, assets, works);
      }
    } else if (node.isArray()) for (var child : node) checkSite(child, cats, assets, works);
  }

  private void validateStoredPath(String relative, String prefix) {
    Path p = root.resolve(relative).normalize();
    if (relative.isBlank()
        || Path.of(relative).isAbsolute()
        || !p.startsWith(root.resolve(prefix))
        || !Files.isRegularFile(p)) throw new IllegalStateException("Missing or unsafe asset file");
  }

  public static ObjectNode defaultSiteContent() {
    try {
      return (ObjectNode) defaults().path("site").path("draft").path("content");
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static ObjectNode defaults() throws Exception {
    ObjectNode n = JSON.createObjectNode();
    String now = Instant.now().toString();
    n.put("schemaVersion", 1).put("dataRevision", 1).put("updatedAt", now);
    n.putArray("works");
    n.putArray("assets");
    n.putArray("categories")
        .addObject()
        .put("id", "category-other")
        .put("name", "其他")
        .put("slug", "other")
        .put("sortOrder", 1)
        .put("enabled", true)
        .put("system", true)
        .put("revision", 1)
        .putNull("deletedAt")
        .put("createdAt", now)
        .put("updatedAt", now);
    ObjectNode site = n.putObject("site");
    site.put("draftRevision", 1)
        .put("stateRevision", 1)
        .put("catalogRevision", 1)
        .putNull("published")
        .put("updatedAt", now);
    site.putObject("draft")
        .set(
            "content",
            JSON.readTree(
                """
{"brand":{"name":"鲸禧设计","tagline":"","logoAssetId":null},"about":{"description":"","mainAssetId":null,"teamImages":[]},"contact":{"email":"","address":"","links":[]},"homepage":{"hero":{"enabled":true,"title":"让设计产生共鸣","description":"","workIds":[]},"featured":{"enabled":true,"title":"精选作品","description":"","workIds":[]},"banner":{"enabled":false,"assetId":null,"desktopFocal":{"x":0.5,"y":0.5},"mobileFocal":{"x":0.5,"y":0.5},"linkedWorkId":null,"logos":[]},"statement":{"enabled":false,"text":"","decorationWorkIds":[]},"categories":{"enabled":false,"categoryIds":[]},"gallery":{"enabled":false,"workIds":[]},"cases":{"enabled":false,"items":[]},"capabilities":{"enabled":false,"items":[]},"closing":{"enabled":true,"title":"一起创造下一份惊喜","showDecoration":true,"iconKeys":[]}}}
"""));
    return n;
  }

  public void close() throws Exception {
    lock.release();
    lockChannel.close();
  }
}
