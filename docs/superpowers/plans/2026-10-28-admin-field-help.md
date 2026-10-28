# 管理后台字段说明 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the following tasks in this session.

**Goal:** 每个后台可编辑字段都说明用途、填写方式及对应的网站效果。

**Architecture:** 保留现有后台布局和操作流程，在字段下方常驻显示帮助文字。将说明集中维护，并通过共享表单组件关联输入框与帮助文字。

**Tech Stack:** React 19、TypeScript、Next.js 16、现有 CSS 与 Docker Compose。

**Spec:** 本轮用户要求：管理页面的每个属性给出明确说明，解释用途和设置后的网站效果；以前台真实渲染及当前接口行为为准。

## Global Constraints

- 覆盖登录、作品列表与编辑、图片上传、封面裁剪、相关作品、网站设置和分类维护。
- 帮助文字默认可见，不依赖鼠标悬停；保留原有字段名称和数据结构。
- 作品及网站设置说明保存草稿与发布的区别；分类和全局排序说明直接生效的范围。
- 不修改管理员凭据或现有运行数据。
- 此次为低影响的说明文案和表单语义调整，不编写复述文案的测试；使用现有测试、类型检查、构建和浏览器验证。

## Review Focus

- 图片替代文字与图注分别说明读屏、加载失败和图片下方显示的用途。
- 封面裁剪只影响作品卡片，详情原比例显示；横幅的桌面与手机焦点独立。
- 分类停用、迁移、删除与排序的说明符合当前服务端实际行为。
- 可选字段、空值回退和固定启用区块不作错误承诺。
- 帮助文字使用 aria-describedby 关联，不混入字段的可访问名称；窄屏可正常换行。

### Task 1: 共享字段说明

**Files:** `apps/web/src/components/fields.tsx`, `apps/web/src/lib/admin-help.ts`, `apps/web/src/app/globals.css`

- [x] 为输入、下拉与勾选控件提供可选帮助文字及可访问关联。
- [x] 集中定义用途、示例、留空表现和前台位置的文案。
- [x] 设置紧凑、可换行且对比度清晰的说明样式。

### Task 2: 覆盖所有管理表单

**Files:** `apps/web/src/components/work-editor.tsx`, `settings-editor.tsx`, `uploads.tsx`, `admin.tsx`

- [x] 补齐作品字段、图片、裁剪、正文排序和相关作品的说明。
- [x] 补齐品牌联系及首页九个区块，包括动态添加的图片、链接、案例和能力。
- [x] 补齐登录、筛选、分类维护和全局排序的作用及生效说明。
- [x] 核对全部字段及动态控件均有适当说明。

### Task 3: 验证与本地更新

- [x] 运行现有前端测试、TypeScript 检查和生产构建。
- [x] 更新本地 web 容器并确认全部服务健康。
- [x] 在浏览器检查作品编辑、网站设置、分类维护及窄屏排版，保存示例截图。
- [x] 确认已有公开作品和管理员配置保持可用，汇报验证结果。
