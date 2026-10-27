# TDD 开发进度与环境记录

2026-10-27。用户已批准代码开发、测试和本地Docker部署。

## 已观察的红绿记录

- 备份脚本：先运行node tests/backup.test.mjs，2个断言失败（脚本尚未存在）；实现后同命令2/2通过。验证备份保留JSON与正式图片、排除临时文件/日志、没有正式数据时拒绝备份。
- 后端与前端各自的真实红绿命令见backend-tdd.md和frontend-tdd.md，最终集成结果另记录。
- Docker Compose 2.40.3 config --quiet和Bash脚本语法检查已通过；这不是实际Docker部署验证。

## 环境限制与决定

- 该执行环境为隔离Linux，系统最初只有Java17运行时。工具链在工作区下载受维护Java21 JDK与Maven3.9.11，不修改用户电脑。
- 包管理系统安装失败（setgroups/seteuid不允许）；未请求或绕过系统提权，改用用户目录中的官方工具包。
- Docker客户端可运行，但没有可访问的Docker引擎：docker info返回Unix socket operation not permitted，进程CapEff为0。没有连接用户Mac上的Docker Desktop。不能声称已在用户电脑启动容器。
- 目标部署保留三服务Compose（gateway、web、api），默认仅绑定127.0.0.1。首次本地脚本交互生成密码哈希与不入Git的.env，挂载项目storage。
- Figma已成功取首页、详情、关于、编辑、设置的高保真上下文与截图；列表、后台列表、登录、手机额外读取返回Starter调用额度限制，已停止重试。共享组件和已交付标注作为这些页面的依据，不能声称所有页面均做了逐节点实时读取。
- 备份脚本采用简单停API备份再启动的方式；因此备份期间会有短暂停服和重新登录。BACKUP_OFFLINE=1仅用于操作者已手动停Java的场景。没有新增在线备份服务。

## 最终验证结果

2026-10-27，完成评审修正后，由协调者重新执行最终套件，均退出0：

| 检查 | 结果与边界 |
| --- | --- |
| `npm test` | 2项真实备份脚本测试、49项前端测试（12个文件）、40项Java测试；全部通过，无失败 |
| `npm --prefix apps/web run typecheck` | TypeScript检查通过；实施者另验证移开.next及增量缓存后仍可通过 |
| `npm --prefix apps/web run build` | Next生产构建通过，公开业务页和受保护预览动态渲染，standalone输出 |
| Java `clean test package` | 40项通过，可执行api.jar生成；最终复跑40项仍通过 |
| `JAVA_HOME=… bash scripts/e2e-api.sh` | 4条真实Java进程HTTP流程通过：匿名/CSRF、前端request函数公开JSON浏览、上传/草稿/预览/发布/下架、WebP/伪装文件 |
| Compose配置与Bash语法 | `docker-compose config --quiet`和四个脚本`bash -n`通过 |
| 浏览器实际打开 | 临时前端预览在1363px视口渲染可读故障提示和导航，无横向溢出；点击作品到/works成功。临时预览已停止 |

上述共95个自动测试用例（2+49+40+4），不是95条浏览器流程。npm的代理配置提示及NO_COLOR警告没有导致测试失败，不作为功能通过证据。

## 评审修正

独立整分支评审初次发现4项重要问题：公开POST未设JSON请求头、保存期间继续编辑被旧响应覆盖、多图上传并发冲突、刷新和分类沿用旧目录。先补失败回归，再修正；复核确认全部关闭，未发现剩余重要问题。另修正详情页503/网络故障被误报404。见[实现评审](../reviews/2026-10-27-implementation-review.md)与[前端红绿记录](frontend-tdd.md)。

## 未完成验收

- **本地Docker部署尚未完成。** 实际`docker info`返回`permission denied … unix:///var/run/docker.sock … socket: operation not permitted`。只运行了配置校验，没有运行镜像构建或容器。没有可操作用户电脑Docker Desktop的执行连接。
- managed浏览器预览环境无法启动Java原生运行时；实际浏览器只检查了前端故障态与导航。完整管理登录/上传/发布的浏览器联动、320/390/768/1440四档视口与真实图片视觉检查仍需本机启动后验收，未用模拟后端冒充集成。
- 最终Docker磁盘上的原子替换、容器重启持久化与完整备份恢复演练未执行；真实临时目录重启与写失败由JUnit覆盖。
- 当前无用户真实作品。请以3件真实项目补充裁剪、透明图、颜色与正文排版验收。

本机运行入口：`bash scripts/local-up.sh`。详细操作见[本地Docker说明](../LOCAL_DOCKER.md)。
