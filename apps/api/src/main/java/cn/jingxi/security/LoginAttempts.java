package cn.jingxi.security;

import java.util.concurrent.ConcurrentHashMap;

/** Per-IP in-memory failures expire after five minutes; bounded to avoid untrusted key growth. */
public final class LoginAttempts {
  private record Failure(int count, long until) {}

  private final ConcurrentHashMap<String, Failure> failures = new ConcurrentHashMap<>();

  public boolean blocked(String address) {
    var f = failures.get(address);
    if (f == null) return false;
    if (f.until() < System.currentTimeMillis()) {
      failures.remove(address, f);
      return false;
    }
    return f.count() >= 10;
  }

  public void failed(String address) {
    if (failures.size() > 10000)
      failures.entrySet().removeIf(e -> e.getValue().until() < System.currentTimeMillis());
    if (failures.size() > 10000) return;
    failures.compute(
        address,
        (key, f) ->
            new Failure(
                f == null || f.until() < System.currentTimeMillis() ? 1 : f.count() + 1,
                System.currentTimeMillis() + 300_000));
  }

  public void succeeded(String address) {
    failures.remove(address);
  }
}
