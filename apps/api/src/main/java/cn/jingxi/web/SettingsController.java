package cn.jingxi.web;

import cn.jingxi.content.PortfolioService;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/v1")
public class SettingsController {
  private final PortfolioService content;

  public SettingsController(PortfolioService content) {
    this.content = content;
  }

  @GetMapping("/categories")
  Object categories() {
    return Payload.response(content.categories());
  }

  @PostMapping("/categories")
  Object create(@RequestBody Map<String, Object> body) {
    return Payload.response(
        content.createCategory((String) body.get("name"), (String) body.get("slug")));
  }

  @PutMapping("/categories/{id}")
  Object update(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(content.updateCategory(id, Payload.node(body)));
  }

  @DeleteMapping("/categories/{id}")
  Object delete(@PathVariable String id, @RequestParam long expectedRevision) {
    return Payload.response(content.deleteCategory(id, expectedRevision));
  }

  @PostMapping("/categories/{id}/migrate")
  Object migrate(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(content.migrateCategory(id, Payload.node(body)));
  }

  @GetMapping("/site/draft")
  Object site() {
    return Payload.response(content.siteDraft());
  }

  @PutMapping("/site/draft")
  Object site(@RequestBody Map<String, Object> body) {
    return Payload.response(
        content.saveSite(Payload.number(body, "expectedDraftRevision"), Payload.content(body)));
  }

  @PostMapping("/site/publish")
  Object publish(@RequestBody Map<String, Object> body) {
    return Payload.response(
        content.publishSite(
            Payload.number(body, "targetDraftRevision"),
            Payload.number(body, "expectedStateRevision")));
  }

  @GetMapping("/previews/site")
  Object preview(@RequestParam long revision) {
    return Payload.response(content.previewSite(revision));
  }
}
