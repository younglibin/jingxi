package cn.jingxi.web;

import cn.jingxi.media.MediaService;
import java.io.IOException;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MediaController {
  private final MediaService media;

  public MediaController(MediaService media) {
    this.media = media;
  }

  @PostMapping("/api/admin/v1/assets")
  Object upload(@RequestParam("file") MultipartFile file) throws IOException {
    return Payload.response(
        media.upload(file.getOriginalFilename(), file.getSize(), file.getInputStream()));
  }

  @GetMapping("/api/admin/v1/assets")
  Object assets() {
    return Payload.response(media.assets());
  }

  @GetMapping("/api/admin/v1/assets/{id}/image/{size}")
  ResponseEntity<FileSystemResource> admin(@PathVariable String id, @PathVariable int size) {
    return image(media.adminFile(id, size));
  }

  @GetMapping("/media/{token}/{size}")
  ResponseEntity<FileSystemResource> publicImage(
      @PathVariable String token, @PathVariable int size) {
    return image(media.publicFile(token, size));
  }

  private ResponseEntity<FileSystemResource> image(Path path) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .contentType(path.toString().endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG)
        .body(new FileSystemResource(path));
  }
}
