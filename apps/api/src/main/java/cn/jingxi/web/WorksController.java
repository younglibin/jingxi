package cn.jingxi.web;

import cn.jingxi.content.PortfolioService;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/v1")
public class WorksController {
  private final PortfolioService content;

  public WorksController(PortfolioService content) {
    this.content = content;
  }

  @GetMapping("/works")
  Object list(
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String categoryId,
      @RequestParam(required = false) String state,
      @RequestParam(defaultValue = "1") int page) {
    return Payload.response(content.listWorks(q, categoryId, state, page));
  }

  @PostMapping("/works")
  Object create() {
    return Payload.response(content.createWork());
  }

  @GetMapping("/works/{id}")
  Object get(@PathVariable String id) {
    return Payload.response(content.work(id));
  }

  @PutMapping("/works/{id}/draft")
  Object save(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(
        content.save(id, Payload.number(body, "expectedDraftRevision"), Payload.content(body)));
  }

  @PostMapping("/works/{id}/cover")
  Object cover(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(
        content.cover(
            id,
            Payload.number(body, "expectedDraftRevision"),
            String.valueOf(body.get("imageId"))));
  }

  @PutMapping("/works/{id}/block-order")
  Object blocks(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(
        content.blockOrder(
            id,
            Payload.number(body, "expectedDraftRevision"),
            Payload.ids(body, "orderedBlockIds")));
  }

  @PostMapping("/works/{id}/publish")
  Object publish(@PathVariable String id, @RequestBody Map<String, Object> body) {
    return Payload.response(
        content.publish(
            id,
            Payload.number(body, "targetDraftRevision"),
            Payload.number(body, "expectedStateRevision")));
  }

  @PostMapping("/works/{id}/{action:unpublish|recycle|restore}")
  Object transition(
      @PathVariable String id, @PathVariable String action, @RequestBody Map<String, Object> body) {
    return Payload.response(
        content.transition(id, Payload.number(body, "expectedStateRevision"), action));
  }

  @GetMapping("/work-order")
  Object order() {
    return Payload.response(content.order());
  }

  @PutMapping("/work-order")
  Object order(@RequestBody Map<String, Object> body) {
    return Payload.response(
        content.order(
            Payload.ids(body, "workIds"), Payload.number(body, "expectedCatalogRevision")));
  }

  @GetMapping("/previews/works/{id}")
  Object preview(@PathVariable String id, @RequestParam long revision) {
    return Payload.response(content.previewWork(id, revision));
  }
}
