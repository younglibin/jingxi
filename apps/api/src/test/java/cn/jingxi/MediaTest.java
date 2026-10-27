package cn.jingxi;

import static org.assertj.core.api.Assertions.*;

import cn.jingxi.content.PortfolioService;
import cn.jingxi.media.MediaService;
import cn.jingxi.store.JsonStore;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class MediaTest {
  @TempDir Path root;
  JsonStore store;
  PortfolioService content;
  MediaService media;

  @BeforeEach
  void start() throws Exception {
    store = new JsonStore(root);
    content = new PortfolioService(store);
    media = new MediaService(store, content);
  }

  @AfterEach
  void stop() throws Exception {
    store.close();
  }

  byte[] png(int width, int height) throws Exception {
    var output = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "PNG", output);
    return output.toByteArray();
  }

  @Test
  void realPngHasPrivateOriginalAndNonUpscaledDisplay() throws Exception {
    byte[] image = png(640, 320);
    var asset = media.upload("../../unsafe.png", image.length, new ByteArrayInputStream(image));
    assertThat(asset).isNotNull();
    assertThat(asset.path("format").asText()).isEqualTo("PNG");
    assertThat(asset.path("width").asInt()).isEqualTo(640);
    assertThat(asset.toString()).doesNotContain("originalPath", "display/", "../../");
    assertThat(asset.path("displayImages").get(0).path("width").asInt()).isEqualTo(480);
    assertThat(asset.path("displayImages").get(1).path("width").asInt()).isEqualTo(640);
    assertThat(Files.isRegularFile(media.adminFile(asset.path("id").asText(), 480))).isTrue();
    assertThatThrownBy(() -> media.publicFile(asset.path("publicToken").asText(), 480))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void privateAssetBecomesReadableOnlyWhilePublishedReferenceExists() throws Exception {
    byte[] data = png(100, 80);
    var asset = media.upload("real.png", data.length, new ByteArrayInputStream(data));
    assertThat(asset).isNotNull();
    var w = content.createWork();
    var c =
        (com.fasterxml.jackson.databind.node.ObjectNode) w.path("draft").path("content").deepCopy();
    c.put("title", "公开作品").put("slug", "public-image");
    c.withArray("blocks")
        .addObject()
        .put("id", "img")
        .put("type", "image")
        .put("assetId", asset.path("id").asText())
        .put("alt", "测试");
    w = content.save(w.path("id").asText(), 1, c);
    String wid = w.path("id").asText(), token = asset.path("publicToken").asText();
    assertThatThrownBy(() -> media.publicFile(token, 480)).isInstanceOf(RuntimeException.class);
    w = content.publish(wid, 2, w.path("stateRevision").asLong());
    assertThat(media.publicFile(token, 480)).isRegularFile();
    content.transition(wid, w.path("stateRevision").asLong(), "unpublish");
    assertThatThrownBy(() -> media.publicFile(token, 480)).isInstanceOf(RuntimeException.class);
    assertThatThrownBy(() -> media.publicFile(token, 999)).isInstanceOf(RuntimeException.class);
  }

  @Test
  void forgedAndOversizedAndAnimatedInputsAreRejected() throws Exception {
    assertThatThrownBy(
            () -> media.upload("fake.jpg", 8, new ByteArrayInputStream("notimage".getBytes())))
        .isInstanceOf(RuntimeException.class);
    assertThatThrownBy(
            () -> media.upload("huge.png", 20_000_001, new ByteArrayInputStream(new byte[0])))
        .isInstanceOf(RuntimeException.class);
    byte[] header = png(10, 10);
    header[16] = 0;
    header[17] = 0;
    header[18] = 0x50;
    header[19] = 0;
    assertThatThrownBy(
            () -> media.upload("too-wide.png", header.length, new ByteArrayInputStream(header)))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void jpegDetectedFromContentAndMetadataStripped() throws Exception {
    var out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(60, 100, BufferedImage.TYPE_INT_RGB), "JPEG", out);
    var asset = media.upload("wrong.png", out.size(), new ByteArrayInputStream(out.toByteArray()));
    assertThat(asset).isNotNull();
    assertThat(asset.path("format").asText()).isEqualTo("JPEG");
    assertThat(ImageIO.read(media.adminFile(asset.path("id").asText(), 480).toFile()).getHeight())
        .isEqualTo(100);
  }

  @Test
  void jpegExifRotationChangesStoredDimensions() throws Exception {
    var raw = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(60, 100, BufferedImage.TYPE_INT_RGB), "JPEG", raw);
    byte[] exif =
        new byte[] {
          (byte) 255,
          (byte) 225,
          0,
          34,
          69,
          120,
          105,
          102,
          0,
          0,
          73,
          73,
          42,
          0,
          8,
          0,
          0,
          0,
          1,
          0,
          18,
          1,
          3,
          0,
          1,
          0,
          0,
          0,
          6,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        };
    var rotated = new ByteArrayOutputStream();
    rotated.write(raw.toByteArray(), 0, 2);
    rotated.write(exif);
    rotated.write(raw.toByteArray(), 2, raw.size() - 2);
    var asset =
        media.upload(
            "portrait.jpg", rotated.size(), new ByteArrayInputStream(rotated.toByteArray()));
    assertThat(asset.path("width").asInt()).isEqualTo(100);
    assertThat(asset.path("height").asInt()).isEqualTo(60);
  }

  @Test
  void staticWebpDecodesAndAnimatedWebpIsRejected() throws Exception {
    byte[] still = getClass().getResourceAsStream("/images/static.webp").readAllBytes();
    var holder =
        new java.util.concurrent.atomic.AtomicReference<
            com.fasterxml.jackson.databind.node.ObjectNode>();
    assertThatCode(
            () ->
                holder.set(
                    media.upload("static.webp", still.length, new ByteArrayInputStream(still))))
        .doesNotThrowAnyException();
    var asset = holder.get();
    assertThat(asset.path("format").asText()).isEqualTo("WEBP");
    assertThat(asset.path("width").asInt()).isEqualTo(3);
    byte[] animated = getClass().getResourceAsStream("/images/animated.webp").readAllBytes();
    assertThatThrownBy(
            () ->
                media.upload("animated.webp", animated.length, new ByteArrayInputStream(animated)))
        .isInstanceOf(cn.jingxi.content.ApiException.class);
  }

  @Test
  void onlyOneImageCanBeProcessedAtATime() throws Exception {
    byte[] data = png(10, 10);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    var blocking =
        new FilterInputStream(new ByteArrayInputStream(data)) {
          public byte[] readNBytes(int len) throws IOException {
            entered.countDown();
            try {
              release.await();
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
              throw new IOException(e);
            }
            return super.readNBytes(len);
          }
        };
    var first =
        java.util.concurrent.CompletableFuture.supplyAsync(
            () -> media.upload("first.png", data.length, blocking));
    assertThat(entered.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
    try {
      assertThatThrownBy(
              () -> media.upload("second.png", data.length, new ByteArrayInputStream(data)))
          .isInstanceOfSatisfying(
              cn.jingxi.content.ApiException.class, e -> assertThat(e.status).isEqualTo(503));
    } finally {
      release.countDown();
      first.get(5, java.util.concurrent.TimeUnit.SECONDS);
    }
  }
}
