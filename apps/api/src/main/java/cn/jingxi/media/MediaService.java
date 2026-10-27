package cn.jingxi.media;

import static cn.jingxi.content.ApiException.*;

import cn.jingxi.content.*;
import cn.jingxi.store.JsonStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Semaphore;
import javax.imageio.*;

public final class MediaService {
  public static final int MAX_BYTES = 20_000_000;
  private final JsonStore store;
  private final PortfolioService content;
  private final Semaphore processing = new Semaphore(1);

  public MediaService(JsonStore store, PortfolioService content) {
    this.store = store;
    this.content = content;
    ImageIO.scanForPlugins();
  }

  public ObjectNode upload(String filename, long size, InputStream input) {
    if (size > MAX_BYTES) throw new ApiException(413, "FILE_TOO_LARGE", "图片最多20MB");
    if (!processing.tryAcquire()) throw new ApiException(503, "IMAGE_BUSY", "图片正在处理，请稍后重试");
    try {
      byte[] data = input.readNBytes(MAX_BYTES + 1);
      if (data.length > MAX_BYTES) throw new ApiException(413, "FILE_TOO_LARGE", "图片最多20MB");
      if (data.length == 0) throw invalid("图片为空");
      String format = detect(data);
      if (format.equals("WEBP")) validateStaticWebp(data);
      BufferedImage decoded;
      try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
        var readers = ImageIO.getImageReaders(stream);
        if (!readers.hasNext()) throw invalid("无法识别图片");
        var reader = readers.next();
        try {
          reader.setInput(stream, false, true);
          int w = reader.getWidth(0), h = reader.getHeight(0);
          if (w < 1 || h < 1 || w > 20000 || h > 20000 || (long) w * h > 40_000_000)
            throw invalid("图片超过40MP或单边20000像素");
          decoded = reader.read(0);
          if (decoded == null) throw invalid("图片损坏");
        } finally {
          reader.dispose();
        }
      }
      if (format.equals("JPEG")) decoded = rotateExif(decoded, orientation(data));
      String aid = UUID.randomUUID().toString(), token = UUID.randomUUID().toString();
      String ext = format.equals("JPEG") ? "jpg" : format.toLowerCase(Locale.ROOT);
      Path originals = store.root().resolve("images/originals"),
          display = store.root().resolve("images/display").resolve(aid);
      Files.createDirectories(originals);
      Files.createDirectories(display);
      Files.createDirectories(store.root().resolve("images/tmp"));
      Path original = originals.resolve(aid + "." + ext);
      Files.write(original, data, StandardOpenOption.CREATE_NEW);
      var asset =
          PortfolioService.object()
              .put("id", aid)
              .put("publicToken", token)
              .put("originalName", safeName(filename))
              .put("format", format)
              .put(
                  "mimeType",
                  format.equals("JPEG") ? "image/jpeg" : "image/" + format.toLowerCase(Locale.ROOT))
              .put("byteSize", data.length)
              .put("width", decoded.getWidth())
              .put("height", decoded.getHeight())
              .put("originalPath", relative(original))
              .put("createdAt", Instant.now().toString());
      var variants = asset.putArray("displayImages");
      int longest = Math.max(decoded.getWidth(), decoded.getHeight());
      for (int bound : new int[] {480, 960, 1600, 2560}) {
        int edge = Math.min(bound, longest);
        double scale = (double) edge / longest;
        int width = Math.max(1, (int) Math.round(decoded.getWidth() * scale)),
            height = Math.max(1, (int) Math.round(decoded.getHeight() * scale));
        BufferedImage output =
            new BufferedImage(
                width,
                height,
                decoded.getColorModel().hasAlpha()
                    ? BufferedImage.TYPE_INT_ARGB
                    : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = output.createGraphics();
        g.setRenderingHint(
            RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(decoded, 0, 0, width, height, null);
        g.dispose();
        String outExt = decoded.getColorModel().hasAlpha() ? "png" : "jpg";
        Path target = display.resolve(bound + "." + outExt);
        if (!ImageIO.write(output, outExt, target.toFile()))
          throw new IOException("No image writer");
        variants
            .addObject()
            .put("size", bound)
            .put("path", relative(target))
            .put("width", width)
            .put("height", height)
            .put("mimeType", outExt.equals("png") ? "image/png" : "image/jpeg")
            .put("byteSize", Files.size(target));
        if (edge == longest) break;
      }
      store.mutate(s -> s.withArray("assets").add(asset));
      return summary(asset);
    } catch (ApiException ex) {
      throw ex;
    } catch (Exception ex) {
      throw invalid("图片无法完整解码或写入失败");
    } finally {
      processing.release();
    }
  }

  private String safeName(String filename) {
    String name = filename == null ? "image" : filename.replace('\\', '/');
    name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
    return name.isBlank() ? "image" : name.substring(0, Math.min(name.length(), 200));
  }

  private String relative(Path path) {
    return store.root().relativize(path).toString().replace('\\', '/');
  }

  private String detect(byte[] d) {
    if (d.length >= 3 && (d[0] & 255) == 255 && (d[1] & 255) == 216 && (d[2] & 255) == 255)
      return "JPEG";
    if (d.length >= 8
        && Arrays.equals(Arrays.copyOf(d, 8), new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10}))
      return "PNG";
    if (d.length >= 12
        && d[0] == 82
        && d[1] == 73
        && d[2] == 70
        && d[3] == 70
        && d[8] == 87
        && d[9] == 69
        && d[10] == 66
        && d[11] == 80) return "WEBP";
    throw invalid("仅支持真实JPEG、PNG和静态WebP");
  }

  private void validateStaticWebp(byte[] bytes) {
    var buffer = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
    long declared = Integer.toUnsignedLong(buffer.getInt(4)) + 8;
    if (declared != bytes.length) throw invalid("WebP文件不完整");
    int offset = 12;
    while (offset + 8 <= bytes.length) {
      String tag = new String(bytes, offset, 4, java.nio.charset.StandardCharsets.US_ASCII);
      long length = Integer.toUnsignedLong(buffer.getInt(offset + 4));
      if (length > bytes.length - offset - 8) throw invalid("WebP内容损坏");
      if (tag.equals("ANIM")
          || tag.equals("ANMF")
          || (tag.equals("VP8X") && length > 0 && (bytes[offset + 8] & 2) != 0))
        throw invalid("仅支持静态WebP");
      offset += 8 + (int) length + (int) (length % 2);
    }
  }

  private int orientation(byte[] bytes) {
    try {
      int cursor = 2;
      while (cursor + 4 < bytes.length) {
        if ((bytes[cursor] & 255) != 255) break;
        int marker = bytes[cursor + 1] & 255;
        if (marker == 218 || marker == 217) break;
        int length = ((bytes[cursor + 2] & 255) << 8) | (bytes[cursor + 3] & 255);
        if (length < 2 || cursor + length + 2 > bytes.length) break;
        if (marker == 225 && length >= 32 && bytes[cursor + 4] == 'E' && bytes[cursor + 5] == 'x') {
          int base = cursor + 10;
          var tiff =
              java.nio.ByteBuffer.wrap(bytes)
                  .order(
                      bytes[base] == 'I'
                          ? java.nio.ByteOrder.LITTLE_ENDIAN
                          : java.nio.ByteOrder.BIG_ENDIAN);
          int directory = base + tiff.getInt(base + 4);
          int count = tiff.getShort(directory) & 65535;
          for (int index = 0; index < count; index++) {
            int tag = directory + 2 + index * 12;
            if ((tiff.getShort(tag) & 65535) == 274) return tiff.getShort(tag + 8) & 65535;
          }
        }
        cursor += length + 2;
      }
    } catch (IndexOutOfBoundsException ignored) {
    }
    return 1;
  }

  private BufferedImage rotateExif(BufferedImage source, int orientation) {
    if (orientation < 2 || orientation > 8) return source;
    int w = source.getWidth(), h = source.getHeight();
    boolean swap = orientation >= 5;
    var result = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) {
        int dx = x, dy = y;
        switch (orientation) {
          case 2 -> dx = w - 1 - x;
          case 3 -> {
            dx = w - 1 - x;
            dy = h - 1 - y;
          }
          case 4 -> dy = h - 1 - y;
          case 5 -> {
            dx = y;
            dy = x;
          }
          case 6 -> {
            dx = h - 1 - y;
            dy = x;
          }
          case 7 -> {
            dx = h - 1 - y;
            dy = w - 1 - x;
          }
          case 8 -> {
            dx = y;
            dy = w - 1 - x;
          }
        }
        result.setRGB(dx, dy, source.getRGB(x, y));
      }
    return result;
  }

  private ObjectNode summary(JsonNode asset) {
    var out = (ObjectNode) asset.deepCopy();
    out.remove("originalPath");
    for (var raw : out.path("displayImages")) {
      var d = (ObjectNode) raw;
      d.remove("path");
      d.put(
          "url",
          "/api/admin/v1/assets/" + asset.path("id").asText() + "/image/" + d.path("size").asInt());
    }
    out.put("previewUrl", out.path("displayImages").get(0).path("url").asText());
    return out;
  }

  public ObjectNode assets() {
    var out = PortfolioService.object();
    var items = out.putArray("items");
    for (var a : store.snapshot().path("assets")) items.add(summary(a));
    return out;
  }

  public Path publicFile(String token, int size) {
    var s = store.snapshot();
    for (var a : s.path("assets"))
      if (a.path("publicToken").asText().equals(token)
          && content.isPublicAsset(s, a.path("id").asText())) return file(a, size);
    throw missing();
  }

  public Path adminFile(String id, int size) {
    for (var a : store.snapshot().path("assets"))
      if (a.path("id").asText().equals(id)) return file(a, size);
    throw missing();
  }

  private Path file(JsonNode a, int size) {
    for (var display : a.path("displayImages"))
      if (display.path("size").asInt() == size) {
        Path path = store.root().resolve(display.path("path").asText()).normalize();
        if (!path.startsWith(store.root().resolve("images/display")) || !Files.isRegularFile(path))
          throw missing();
        return path;
      }
    throw missing();
  }
}
