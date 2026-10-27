# 本地运行、测试与备份

2026-10-27。适用于个人电脑上的 Docker Desktop 或 Linux Docker Engine + Compose v2。只运行单个 Java 写实例；没有数据库容器。当前交付已准备配置和脚本，实际容器验收尚未完成，原因见[验证记录](testing/implementation-progress.md)。

## 启动

```bash
git clone https://github.com/younglibin/jingxi.git
cd jingxi
git checkout codex/tdd-file-portfolio
bash scripts/local-up.sh
```

已有本仓库时进入其根目录即可。启动前打开 Docker Desktop。首次运行输入管理员密码两次；要求至少 12 个字符且 UTF-8 编码不超过 72 字节。用户名默认 `admin`，需要更改可先执行 `export ADMIN_USERNAME=你的英文用户名`。密码不会明文写入文件，生成的 BCrypt 哈希保存在 `.env`，不要提交或转发该文件。

首次构建需下载 Maven/npm 依赖和基础镜像。脚本构建时运行 Java 与前端测试，随后启动服务并等待健康检查。默认入口：

| 地址 | 用途 |
| --- | --- |
| http://localhost:8080 | 首页、作品、关于联系 |
| http://localhost:8080/admin | 登录与管理后台 |
| http://localhost:8080/api/health | API 健康检查 |

仅向本机 `127.0.0.1` 绑定端口，不开放公网。要改端口，在 `.env` 修改 `PORT=8080` 后重新执行启动脚本。本地 HTTP 使用 `COOKIE_SECURE=false`；将来部署 HTTPS 时需另行设置安全 Cookie 和反向代理，本次不自动发布网站。

```bash
docker compose ps
docker compose logs --tail=100 api web gateway
docker compose restart api
docker compose down
```

重启 Java 后要重新登录，已经保存的内容仍从 JSON 恢复。停止服务不会删除 `storage/`。初始站点为空占位，请在后台维护分类、上传作品并发布，再设置站点标题、首页模块、联系方式和图片。

## 数据与首图

| 路径 | 内容 |
| --- | --- |
| storage/data/store.json | 作品、分类、资源和站点配置 |
| storage/data/store.lock | Java 单写进程锁 |
| storage/images/originals/ | 不公开的原图 |
| storage/images/display/ | 经授权接口提供的显示图 |
| storage/images/tmp/ | 上传处理临时文件 |
| storage/backups/ | 备份中转目录 |

`coverImageId` 指向作品中的图片块编号；首图固定在图文块首位，`sortOrder=1`。设新首图会将它移至第一位，其他块保留相对顺序，并为新图重置 3:4 裁剪。删首图后提升第一张剩余图片。资源本身不记录首图身份或顺序，文件无需移动；详情按图文块顺序展示图片原比例。

修改后先保存草稿，预览确认再发布。未发布草稿不影响访客当前可见版本。单张上传不超过 20,000,000 字节、40MP 或单边 20,000 像素，支持 JPG、PNG、静态 WebP；每次最多选择 10 张，每件作品最多 30 个图文块。失败项可手动重试。

## 自动测试

在宿主机安装 Node 24、JDK 21、Maven 3.9 后：

```bash
npm ci
npm --prefix apps/web ci
npm test
npm --prefix apps/web run typecheck
npm run build
bash scripts/e2e-api.sh
```

`JAVA_HOME` 必须指向 JDK 21。若 Maven 不在 PATH，设置 `MAVEN_CMD=/你的/maven/bin/mvn`。真实 HTTP 测试在 `18081` 端口运行独立 Java 进程，使用临时存储和专用测试账号，结束后清理；运行前确保该端口空闲。它验证 API 生命周期，不代表完整浏览器端到端验收。

宿主机开发可分别运行 Java（显式设置 `STORAGE_ROOT`、`ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`、`COOKIE_SECURE=false`）和 `npm run dev`。默认前端 3000、API 8081；前端通过 `API_INTERNAL_URL` 访问 API。首次建议使用上面的 Docker 脚本，避免手工配置哈希或路径。

## 备份与恢复

```bash
bash scripts/backup.sh
```

脚本短暂停止 API，打包同一时点的 JSON、原图、显示图，生成 SHA-256 校验文件，结束后恢复原来运行的 API。备份期间网站无法读取内容，API 重启后需要重新登录。包不含临时文件、日志、已有备份和账号 `.env`。无需在线快照服务。`BACKUP_OFFLINE=1` 仅用于已经手动停止 Java 的场景，不能在仍有写入时使用。

将 `.tar.gz` 和 `.sha256` 复制到另一台机器或移动硬盘；本机目录不是灾难恢复备份。保留策略手工管理即可，不自动删图或删除旧包。另行保管 `.env`，或恢复后重新设置管理员密码。

恢复时执行 `docker compose down`，保留当前 `storage/` 副本，核对备份校验值，在空目录解包检查，再替换 `storage/data/store.json` 与对应的 `storage/images/originals`、`storage/images/display`。将目录所有者设为 `.env` 中的 `LOCAL_UID:LOCAL_GID`，再执行 `bash scripts/local-up.sh`。不要只恢复 JSON 或只恢复图片。启动后核对三个作品的首图、正文顺序、分类与公开状态。

目前自动测试验证了真实目录读写、重启重新加载和备份包范围；尚未执行 Docker 容器级恢复演练。
