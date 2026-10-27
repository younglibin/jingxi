# 作品展示网站 jingxi

作品展示网站与单维护者后台。Java 21 管理本地 JSON 和图片，Next.js 提供公开页面与后台，Nginx 统一转发；不使用关系数据库或 Redis。图片、品牌和公司内容由维护者自行上传。

## 本地 Docker 启动

安装并启动 Docker Desktop，在仓库根目录执行：

```bash
bash scripts/local-up.sh
```

首次运行要求设置至少 12 位的管理员密码，脚本生成不入 Git 的 `.env`、构建镜像并等待三个服务健康。默认访问 `http://localhost:18080`，管理入口 `/admin`，用户名默认 `admin`。没有预置管理员密码。运行数据在项目的 `storage/`，更新镜像不会清空内容。

完整启动、测试、备份和恢复步骤见 [本地运行说明](docs/LOCAL_DOCKER.md)。本次执行环境无法访问 Docker 引擎，容器启动验收仍待在有 Docker 的本机执行；已完成的检查和限制见 [验证记录](docs/testing/implementation-progress.md)。

## 阅读入口

1. [文档目录与版本说明](docs/README.md)
2. [模块需求说明 v0.2](docs/requirements/module-requirements-v0.2.md)：8 个页面模板、24 个功能模块、数据规则与验收条件。
3. [设计交付说明 V1.1](docs/design-handoff-v1.1.md)：Figma 入口、页面编号、尺寸、响应式规则、交互和待确认事项。
4. [技术方案与评审入口](docs/superpowers/specs/2026-10-27-portfolio-technical-design.md)：前后端分离、Java 后端，使用本地 JSON 文件和项目图片目录。
5. [数据模型、字段与首图排序](docs/architecture/data-api-contract.md)：5 个逻辑模型与完整作品示例。
6. [Figma V1.1 评审入口](https://www.figma.com/design/x9YTf9CS1R6DNi9NBUxCom?node-id=39-328)

## 当前设计方向

首页采用纵向长页滚动，包含 9 个内容区块，配合首屏卡片展开、滚动显现和局部横向画廊。访客自主控制浏览节奏，整页不定时自动轮播，不强制每次翻一屏。作品点击后进入独立详情页。

作品图片、品牌文字和公司信息由维护者提供，当前设计允许使用可替换占位。公开网站供访客浏览，管理后台供维护者上传作品和维护内容。

## 代码与测试

`apps/api` 为 Java 后端，`apps/web` 为公开网站和管理界面，`infra` 为 Docker 与 Nginx 配置，`tests/e2e` 为真实 HTTP 流程测试。功能包括作品图文编辑、唯一首图与排序、草稿预览、发布下架、分类与站点设置。

安装 Node 24、JDK 21 和 Maven 后：

```bash
npm ci
npm --prefix apps/web ci
npm test
npm --prefix apps/web run typecheck
npm run build
bash scripts/e2e-api.sh
```

`npm test` 运行脚本、前端和后端测试；HTTP 流程脚本使用临时数据与专用测试账号，不修改 `storage/`。测试驱动开发的失败断言及修正记录在 [后端](docs/testing/backend-tdd.md) 和 [前端](docs/testing/frontend-tdd.md)。
