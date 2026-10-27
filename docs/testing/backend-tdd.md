# Java API TDD 实测记录

2026-10-27。Java 21.0.13、Spring Boot 4.1.2；所有测试使用真实临时目录、文件、图片与进程内存，不使用数据库、队列或mock服务。

## 红绿循环

每轮先写行为测试与可编译空壳，观察失败后补实现；回归始终运行完整后端套件。

| 轮次 | 真实 RED 观察 | GREEN 实现与验证 |
| --- | --- | --- |
| 1 文件底座 | `JsonStoreTest` 4项，默认快照为null、第二写者未拒绝、损坏文件被接受；失败替换用例因空壳不能读取修订 | 原子替换、force刷写、锁先于加载、默认分类/完整站点、读快照隔离；4项通过 |
| 2 作品 | `ContentTest` 9项，create返回null断言失败，其余依赖尚未实现行为 | 草稿保存与冲突、首图提升/删除/跨比例重置、下架旧发布保护、回收恢复、完整排序与25作品12/24/36浏览；13项全套通过 |
| 3 分类/配置 | `SettingsTest` 4项，分类与站点返回null断言失败 | 分类保护/改名/停用/引用删除/批量迁移、配置草稿发布与已解析公开响应；17项通过 |
| 4 图片 | `MediaTest` 4项全部断言失败：上传返回null、伪装/20MB超限未拒绝 | 真实JPEG/PNG、原图私有、显示档位与不放大、仅公开引用媒体可读；21项通过 |
| 5 密码CLI | `PasswordTest` BCrypt.matches期望true实际false | stdin密码编码、仅输出BCrypt哈希、早于应用启动分支；22项通过 |
| 6 HTTP | `HttpApiTest` 5项全部断言失败：公开/CSRF均401、匿名错误缺JSON code | Spring Security会话/CSRF/JSON登录错误，分功能控制器、媒体与健康、真实HttpClient保存冲突/预览；27项通过 |
| 7 启动引用 | 结构正确但悬空作品启动未抛异常 | 启动扫描编号、作品/分类/图片/站点引用、受限实际图片路径；28项通过 |
| 8 登录限速 | 第10次失败后blocked仍false | 每IP内存失败计数、五分钟到期、成功重置；29项通过 |
| 9 不可变快照 | 写入回调保留引用后，marker期望safe实际bad | 提交时再次深复制，回调也无法修改已提交内存；30项通过 |
| 10 EXIF | 方向6的JPEG宽度期望100实际60 | 显示像素校正方向，上传元数据使用校正后宽高；31项通过 |
| 11 WebP与并发 | 静态WebP被拒绝；第一上传阻塞时第二上传未抛503 | TwelveMonkeys静态WebP真实解码、动画拒绝、处理Semaphore为1；33项通过 |
| 12 输入错误合同 | 不存在图片引用错误状态期望422实际404 | 引用校验统一字段错误422，资源本身不存在仍404；34项通过 |
| 13 接口评审修正 | 相关作品只有1项，期望3项；详情client为空；team.image.url为空 | 手选优先/同类当前排序补足3项，排除自身/重复/下架；client/role来自公开版；team与logo统一image对象、外链独立url；37项通过 |
| 14 草稿引用一致性 | 不存在的关联作品草稿保存未抛异常，会导致后续重启拒绝载入 | 保存即验证关联作品存在性，可引用未发布但实际存在的作品；38项通过 |
| 15 重复发布不写盘 | 重复发布后dataRevision期望5实际6 | 无变化事务直接返回独立快照，不重写JSON或递增数据修订；39项通过 |
| 16 固定装饰图标 | 六种合法图标保存成功后，追加unknown-icon仍未拒绝 | 仅允许star/circle/diamond/wave/flower/arrow，其他输入422；40项通过 |

最初Maven直连DNS不可用；使用当前进程HTTP代理和系统CA信任库后成功。代理凭据只写临时私密settings，未写仓库或日志。实现后用临时google-java-format格式化，未引入运行时格式化依赖。

## 最终验证

真实执行命令为 `/tmp/jingxi-mvn clean test package`，该临时包装器设置以下Java21/Maven命令并为当前进程生成私密代理settings：

```bash
JAVA_HOME=/workspace/scratch/be85d0bbc34b/toolchain/jdk-21.0.13+9
PATH="$JAVA_HOME/bin:$PATH"
MAVEN_OPTS=-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts
/workspace/scratch/be85d0bbc34b/toolchain/apache-maven-3.9.11/bin/mvn \
  -s /tmp/jingxi-maven-settings.xml -f apps/api/pom.xml clean test package
```

最终结果：**40 tests, 0 failures, 0 errors, 0 skipped；BUILD SUCCESS**。可执行包 `apps/api/target/api.jar`。JUnit报告位于target/surefire-reports（构建产物不提交）。测试进程日志确认Java21、Boot4.1.2、真实随机端口Tomcat启动。

## 范围与限制

- 原子替换和进程锁只在本环境真实临时文件系统验证；最终部署磁盘仍需复验。
- 图片原件与显示图不自动清理。处理/登记失败允许留下未引用文件，符合首期方案。
- 当前公开媒体授权按每次请求的公开快照扫描；无共享缓存、数据库或后台任务。
- 登录限速为单进程内存计数，重启清零；不替代生产入口的流量限制。
- 40项后端测试不是浏览器验收或Docker运行结果；跨进程发布/重启和真实页面由集成任务执行。
