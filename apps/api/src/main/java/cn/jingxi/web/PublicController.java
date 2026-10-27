package cn.jingxi.web;

import cn.jingxi.content.PortfolioService;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/v1")
public class PublicController {
  private final PortfolioService content;

  public PublicController(PortfolioService content) {
    this.content = content;
  }

  @GetMapping("/site")
  Object site() {
    return Payload.response(content.publicSite());
  }

  @GetMapping("/works/catalog")
  Object catalog() {
    return Payload.response(content.catalog());
  }

  @PostMapping("/works/browse")
  Object browse(@RequestBody Map<String, Object> request) {
    return Payload.response(content.browse(Payload.node(request)));
  }

  @GetMapping("/works/{slug}")
  Object detail(@PathVariable String slug) {
    return Payload.response(content.detail(slug));
  }
}
