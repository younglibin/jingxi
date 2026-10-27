package cn.jingxi.web;

import cn.jingxi.content.ApiException;
import cn.jingxi.store.JsonStore;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;

final class Payload {
  private Payload() {}

  static ObjectNode node(Map<String, Object> body) {
    return JsonStore.JSON.valueToTree(body);
  }

  static ObjectNode content(Map<String, Object> body) {
    var n = node(body).path("content");
    if (!(n instanceof ObjectNode o)) throw ApiException.invalid("content必须是对象");
    return o;
  }

  static long number(Map<String, Object> body, String key) {
    Object n = body.get(key);
    if (!(n instanceof Number v) || v.longValue() < 1) throw ApiException.invalid(key + "必须是正整数");
    return v.longValue();
  }

  static List<String> ids(Map<String, Object> body, String key) {
    Object n = body.get(key);
    if (!(n instanceof List<?> values) || values.stream().anyMatch(v -> !(v instanceof String)))
      throw ApiException.invalid(key + "必须是数组");
    return values.stream().map(String.class::cast).toList();
  }

  static Object response(ObjectNode n) {
    return JsonStore.JSON.convertValue(n, Object.class);
  }
}
