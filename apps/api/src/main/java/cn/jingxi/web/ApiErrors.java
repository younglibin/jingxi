package cn.jingxi.web;

import cn.jingxi.content.ApiException;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<Object> api(ApiException ex) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("code", ex.code);
    body.put("message", ex.getMessage());
    if (ex.currentRevision != null) body.put("currentRevision", ex.currentRevision);
    return ResponseEntity.status(ex.status).body(body);
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<Object> large() {
    return ResponseEntity.status(413).body(Map.of("code", "FILE_TOO_LARGE", "message", "图片最多20MB"));
  }

  @ExceptionHandler({
    org.springframework.http.converter.HttpMessageNotReadableException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
    org.springframework.web.multipart.support.MissingServletRequestPartException.class
  })
  ResponseEntity<Object> bad(Exception ex) {
    return ResponseEntity.unprocessableEntity()
        .body(Map.of("code", "VALIDATION_ERROR", "message", "请求格式不正确"));
  }

  @ExceptionHandler(IllegalStateException.class)
  ResponseEntity<Object> storage(IllegalStateException ex) {
    return ResponseEntity.status(503)
        .body(Map.of("code", "STORAGE_UNAVAILABLE", "message", "暂时无法保存，请重试"));
  }
}
