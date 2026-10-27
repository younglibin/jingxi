package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import cn.jingxi.store.JsonStore;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class JsonStoreTest {
  @TempDir Path root;

  @Test
  void persistsAtomicChangesAndProtectsSnapshot() throws Exception {
    try (var store = new JsonStore(root)) {
      assertThat(store.snapshot()).isNotNull();
      assertThat(store.snapshot().path("categories").get(0).path("name").asText()).isEqualTo("其他");
      store.mutate(n -> n.put("marker", "saved"));
      var external = store.snapshot();
      external.put("marker", "tampered");
      assertThat(store.snapshot().path("marker").asText()).isEqualTo("saved");
    }
    try (var reopened = new JsonStore(root)) {
      assertThat(reopened.snapshot().path("marker").asText()).isEqualTo("saved");
    }
  }

  @Test
  void secondWriterCannotOpenOrReadCorruptFile() throws Exception {
    try (var first = new JsonStore(root)) {
      assertThatThrownBy(() -> new JsonStore(root)).isInstanceOf(Exception.class);
    }
  }

  @Test
  void corruptExistingFileIsNotReinitialized() throws Exception {
    Files.createDirectories(root.resolve("data"));
    Files.writeString(root.resolve("data/store.json"), "broken");
    assertThatThrownBy(() -> new JsonStore(root)).isInstanceOf(Exception.class);
    assertThat(Files.readString(root.resolve("data/store.json"))).isEqualTo("broken");
  }

  @Test
  void failedAtomicReplacementPreservesMemory() throws Exception {
    try (var store = new JsonStore(root)) {
      long revision = store.snapshot().path("dataRevision").asLong();
      Files.delete(root.resolve("data/store.json"));
      Files.createDirectory(root.resolve("data/store.json"));
      assertThatThrownBy(() -> store.mutate(n -> n.put("marker", "bad")))
          .isInstanceOf(RuntimeException.class);
      assertThat(store.snapshot().path("dataRevision").asLong()).isEqualTo(revision);
      assertThat(store.snapshot().has("marker")).isFalse();
    }
  }

  @Test
  void structurallyValidButDanglingWorkIsRejectedAtStartup() throws Exception {
    try (var store = new JsonStore(root)) {
      store.mutate(
          s -> {
            var w = s.withArray("works").addObject();
            w.put("id", "broken")
                .putObject("draft")
                .putObject("content")
                .put("categoryId", "nonexistent")
                .putArray("blocks");
          });
    }
    assertThatThrownBy(() -> new JsonStore(root)).isInstanceOf(Exception.class);
  }

  @Test
  void mutatorCannotKeepReferenceToCommittedMemory() throws Exception {
    try (var store = new JsonStore(root)) {
      var escaped =
          new java.util.concurrent.atomic.AtomicReference<
              com.fasterxml.jackson.databind.node.ObjectNode>();
      store.mutate(
          s -> {
            s.put("marker", "safe");
            escaped.set(s);
          });
      escaped.get().put("marker", "bad");
      assertThat(store.snapshot().path("marker").asText()).isEqualTo("safe");
    }
  }
}
