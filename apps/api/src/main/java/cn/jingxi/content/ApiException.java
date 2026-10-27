package cn.jingxi.content;

public class ApiException extends RuntimeException {
  public final int status;
  public final String code;
  public final Long currentRevision;

  public ApiException(int status, String code, String message) {
    this(status, code, message, null);
  }

  public ApiException(int status, String code, String message, Long revision) {
    super(message);
    this.status = status;
    this.code = code;
    this.currentRevision = revision;
  }

  public static ApiException invalid(String message) {
    return new ApiException(422, "VALIDATION_ERROR", message);
  }

  public static ApiException missing() {
    return new ApiException(404, "NOT_FOUND", "内容不存在");
  }

  public static void revision(long actual, long expected) {
    if (actual != expected) throw new ApiException(409, "REVISION_CONFLICT", "内容已更新，请刷新", actual);
  }
}
