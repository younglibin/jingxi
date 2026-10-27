package cn.jingxi;

import cn.jingxi.content.PortfolioService;
import cn.jingxi.media.MediaService;
import cn.jingxi.store.JsonStore;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

@SpringBootApplication
public class Application {
  public static void main(String[] args) throws Exception {
    if (java.util.Arrays.asList(args).contains("--hash-password")) {
      var reader = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
      String value = reader.readLine();
      if (value == null || value.isEmpty())
        throw new IllegalArgumentException("Password required on stdin");
      System.out.println(hashPassword(value));
      return;
    }
    SpringApplication.run(Application.class, args);
  }

  public static String hashPassword(String password) {
    return new BCryptPasswordEncoder(12).encode(password);
  }

  @Bean(destroyMethod = "close")
  JsonStore jsonStore(@Value("${storage.root}") String root) throws Exception {
    return new JsonStore(Path.of(root));
  }

  @Bean
  PortfolioService portfolio(JsonStore store) {
    return new PortfolioService(store);
  }

  @Bean
  MediaService media(JsonStore store, PortfolioService content) {
    return new MediaService(store, content);
  }
}
