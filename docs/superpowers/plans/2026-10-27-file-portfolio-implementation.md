# 作品展示网站 TDD 开发计划

> 执行要求：按测试驱动开发逐项完成；前端与后端在接口合同固定后并行，统一进行集成和整分支评审。

**Goal（目标）：** 交付可维护作品、设置首图和排序、草稿发布、公开浏览的网站，并准备本地Docker部署。
**Architecture（架构）：** Java单进程管理storage/data/store.json，读取不可变内存快照，文件原子替换后切内存。Next.js公开与后台界面，同源Nginx，项目图片三目录。
**Tech Stack（技术栈）：** Java21、Spring Boot4.1.2、Next16稳定补丁、TypeScript、CSS、JUnit、Vitest、浏览器端到端测试。
**Spec（规格）：** docs/architecture/data-api-contract.md；contracts/runtime-api.md；Figma x9YTf9CS1R6DNi9NBUxCom。

## Global Constraints（全局约束）

无SQL数据库、无队列、无共享写实例；上传20,000,000字节，40MP，单边20,000；一次最多10张，作品块最多30；唯一首图固定blocks首位sortOrder1；本地storage不进Git；账号哈希不进Git。先观察失败断言，再实现最小行为，再跑全套。

## Review Focus（评审重点）

1. 文件写失败或重启：不能丢旧内容或把草稿变公开，任务1验证真实临时目录与文件锁。
2. 下架后旧发布请求：不得重新上线，任务2验证状态修订。
3. 文字先于首图、替换比例：首图提升与裁剪一致，任务2/4验证。
4. 匿名草稿媒体与越界路径：都应拒绝，任务3与5验证。
5. 手机长内容、暂停、后退恢复：不靠动画才能点击，任务4/5验证。

## Task 1 文件底座

Files: apps/api/pom.xml、src/main/java/.../store、src/test/java/.../store。
Interfaces: JsonStore读取当前Store快照，mutate在单锁内副本更新、落盘后切换；close释放进程锁。
- [x] RED：重启恢复、第二实例拒绝、已有损坏文件拒绝、保存失败旧快照不变。
- [x] GREEN：实现最小JSON文件、原子替换和不可变快照；运行JUnit全套。
- [x] Commit：合并在本地实现提交25e3124。

## Task 2 作品与配置业务

Files: apps/api/.../content、.../publicquery、相应测试。
Interfaces: 见runtime-api合同中的Work、SiteConfig和公开DTO。
- [x] RED：草稿隔离、版本冲突、首图提升/删除/裁剪、重复发布、下架旧请求、分类引用、排序完整集合、列表25项。
- [x] GREEN：实现服务与默认空站配置；所有状态一次Store变更；跑全套。
- [x] Commit：合并在本地实现提交25e3124。

## Task 3 登录与上传接口

Files: apps/api/.../security、.../media、.../web、相应测试。
- [x] RED：未认证/CSRF拒绝、真实PNG上传、伪装/超限拒绝、私有媒体不可读、公开媒体仅在有效引用时可读。
- [x] GREEN：Spring Security单维护者、同步ImageIO显示图、控制器错误映射；完整API集成测试。
- [x] Commit：合并在本地实现提交25e3124。

## Task 4 公开与管理界面

Files: apps/web/package.json、src/app、src/components、src/lib、tests。
Interfaces: 严格消费contracts/runtime-api.md；Figma可读核心节点参考保存于忽略目录.superpowers/figma。
- [x] RED：首图与顺序编辑函数、错误保留输入、菜单/放大首末、加载更多与恢复的组件或纯函数测试。
- [x] GREEN：四个公开页面、管理登录/列表/编辑/设置、上传重试、首图与块排序、配置分类、受保护预览；先静态功能再局部运动。
- [ ] Verify：npm test、tsc、next build；真实浏览器桌面/手机主路径。
- [x] Commit：合并在本地实现提交25e3124及后续评审修正。

## Task 5 集成与Docker交付

Files: compose.yaml、infra/*、scripts/*、tests/e2e、docs/testing/*、README。
- [ ] RED：真实进程端到端测试覆盖创建/上传/草稿私有/发布/浏览/下架与重启持久化。
- [x] GREEN：修复集成差异；所有测试与构建通过后编写红绿记录和部署说明。
- [x] Docker：默认只绑定127.0.0.1；从.env读本地用户名和密码哈希；挂载./storage；健康检查和备份恢复脚本。
- [x] Review：独立整分支评审并修复重要问题，最终跑全套。
- [ ] Deploy：若有可用Docker引擎，compose up并核对健康与页面；若运行环境未连接用户本机或无引擎，明确记录阻断，不宣称已部署。

用户已直接要求开发、测试和本地Docker部署，无需在任务间重复确认。当前分支codex/tdd-file-portfolio，保留main文档基线。Docker引擎/本机连接是环境前置条件，不能用云发布替代。

## 执行结果（2026-10-27）

- 任务1—3已实施，真实JUnit测试验证文件保存失败、重启加载、文件锁、草稿隔离、首图排序、发布与媒体权限；详细红绿记录见 docs/testing/backend-tdd.md。
- 任务4已实施四类公开页面和后台模块，组件行为采用Vitest红绿循环；独立评审发现的请求头、上传队列、列表目录刷新和保存中编辑问题已补充回归，最终结论见验证记录。浏览器实际检查受运行环境限制，不能宣称已完成所有尺寸和后台操作验收。
- 任务5已有Compose、Nginx、首次账号初始化、备份、真实HTTP测试。脚本范围先观察2项失败断言再实现通过；HTTP测试补充集成验证。
- 实现集中在本地提交25e3124，随后修复评审意见；未将每个计划任务机械拆为单独功能提交。
- Docker配置校验通过；docker info实际返回Unix socket operation not permitted，未构建或运行容器。Deploy项仍未完成。
- 最终测试数、评审关闭情况和交付入口以 docs/testing/implementation-progress.md 为准。
