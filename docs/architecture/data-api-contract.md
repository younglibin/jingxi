# 作品展示网站数据模型与文件存储方案

版本 1.1 · 2026-10-27。根据本轮要求取消关系数据库，采用 Java 内存对象加项目内 JSON 文件；图片放项目下的目录。本文明确数据模块、字段、首图和排序规则及接口输入，不是已实现代码。

配套：[技术主方案](../superpowers/specs/2026-10-27-portfolio-technical-design.md)、[部署与验证](deployment-and-verification.md)、[评审记录](../reviews/2026-10-27-technical-design-review.md)。

## 1 存储怎么选

采用一个 storage/data/store.json 保存业务数据，Java 启动时加载为内存对象与 Map 索引。读取走内存；修改先形成新副本，完整写入文件成功后再替换当前内存对象。重启可恢复已保存内容。

不使用纯内存作为唯一存储，否则重启会丢作品配置；也不引入 H2、SQLite、Redis、JDBC 或其他数据库服务。一个维护者、一个 Java 进程写这个文件，不支持两个服务实例共享写入。

## 2 五个逻辑数据模型

没有物理数据库表。以下相当于“逻辑表”，实际在 JSON 中用对象或数组表示。

| 模型 | 存放位置 | 功能 | 与其他模型的关系 |
| --- | --- | --- | --- |
| 作品 Work | works[] | 标题、分类、草稿、当前公开版、状态、全局作品顺序 | 包含图片与文字内容块，引用分类 |
| 图片内容块 ImageBlock | work.draft.content.blocks[]，公开版有独立副本 | 某件作品如何使用一张图、是否首图、显示顺序、图注 | assetId 指向图片资源；不是另一份文件 |
| 图片资源 Asset | assets[] | 实际文件位置、格式、宽高、大小、显示图 | 可被多个内容块和站点配置复用 |
| 分类 Category | categories[] | 品牌设计、包装设计等分类及顺序 | Work.draft.content.categoryId 或当前公开内容引用 |
| 网站配置 SiteConfig | site | 品牌、联系、首页 9 区块与各自作品集合 | 引用作品、分类和图片资源 |

图片内容块嵌在作品里，不再单独保存 workImages.json；首图和其他图片共享同一个顺序来源。账号密码哈希在私密配置里，会话只在内存里，不加入业务 JSON。操作日志写普通日志文件，不建立日志表。

## 3 项目目录

| 路径 | 内容 |
| --- | --- |
| storage/data/store.json | 当前完整业务数据，UTF-8 JSON |
| storage/data/store.lock | 防止启动两个写进程；不是业务数据 |
| storage/images/originals/{assetId}.{ext} | 上传原图，保留原始文件，不覆盖 |
| storage/images/display/{assetId}/{size}.{ext} | 已校正方向和缩放的显示图 |
| storage/images/tmp/{uploadId}/ | 未完成上传和处理的临时文件 |
| storage/backups/ | 本机临时备份包，之后复制到机器外 |
| storage/logs/ | 普通运行与管理操作日志 |

图片只需要 originals、display、tmp 三类目录，不按“首图/其他图”搬文件；角色由作品数据决定。storage 是项目根目录下的运行数据目录，不是 apps/web/public，不允许 Nginx 直接公开整个目录。路径在 JSON 中保存为相对 storage 的路径，换机器时不必批量改绝对地址。

运行数据不提交 Git，开发时将 /storage/ 加入忽略列表。GitHub 只保存代码、文档和脱敏示例。当前只修订文档，实际目录在开发运行时创建。

## 4 文件根对象字段

| 字段 | 类型 | 必填 | 默认与作用 |
| --- | --- | --- | --- |
| schemaVersion | integer | 是 | 1；文件格式版本 |
| dataRevision | integer | 是 | 每次成功落盘递增，覆盖上传登记、保存、发布、分类和排序 |
| updatedAt | string | 是 | UTC 的 ISO 8601 时间 |
| works | Work[] | 是 | 默认空数组 |
| assets | Asset[] | 是 | 默认空数组，仅登记全部文件已就绪的资源 |
| categories | Category[] | 是 | 初始包含受保护的“其他”分类 |
| site | SiteConfig | 是 | 品牌与首页配置单例 |

所有对象的 id 由服务端生成且不可变。示例使用易读编号，正式实现可用随机 UUID。公开作品另有 publicKey，公开接口不返回后台 workId、草稿或文件系统路径。

## 5 作品 Work 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | 后台稳定作品编号 |
| publicKey | string | 是 | 对外卡片去重编号，与后台编号分离 |
| lockedSlug | string 或 null | 否 | 首次发布后固定的访问标识；回收后不释放 |
| draftRevision | integer | 是 | 草稿保存版本；新建从 1 开始 |
| stateRevision | integer | 是 | 保存、发布、下架、回收和恢复时递增 |
| draft | Draft | 是 | 当前维护内容 |
| published | Published 或 null | 否 | 当前完整公开快照；未首次发布为 null |
| visible | boolean | 是 | 默认 false；只有有 published 且不在回收区时才允许为 true |
| sortOrder | integer 或 null | 否 | 全局公开作品顺序，公开时 1 开始；下架为 null |
| recycledAt | string 或 null | 否 | 非 null 表示在回收区 |
| lastPublishedAt | string 或 null | 否 | 最近一次主动发布或重新上架时间 |
| createdAt、updatedAt | string | 是 | 创建与最后变更时间 |

### 5.1 Draft 和 Published

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| draft.content | WorkContent | 当前完整草稿内容 |
| published.version | integer | 发布版本号，从 1 开始；新内容发布递增 |
| published.sourceDraftRevision | integer | 这份公开版来自哪个草稿版本 |
| published.publishedAt | string | 此公开内容版本建立时间 |
| published.content | WorkContent | 草稿内容的深复制；后续保存不得连带修改它 |

首期只保留当前草稿和当前公开版，不另存所有历史发布版本。下架保留 published 但 visible=false；相同内容重新上架复用该快照并更新 lastPublishedAt。完整历史回溯暂不做，可从备份恢复。

### 5.2 WorkContent 业务字段

| 字段 | 类型 | 保存与发布要求 |
| --- | --- | --- |
| title | string | 发布必填 1–60 字，草稿可空 |
| slug | string | 发布必填 3–80 位小写字母、数字与连字符；首次发布后等于 lockedSlug |
| categoryId | string | 默认“其他”；仅一个分类 |
| summary | string | 0–200 字 |
| client | string | 0–60 字，可空 |
| year | integer 或 null | 1900 至当前年加 1，可空 |
| role | string | 0–100 字，可空 |
| coverImageId | string 或 null | 指向本作品 blocks 中 type=image 的 id；唯一首图；发布必填 |
| coverCrop | object 或 null | 首图卡片用的 0–1 裁剪矩形，3:4；详情首图完整展示 |
| coverFocal | object 或 null | {x,y}，0–1；默认居中 |
| blocks | ContentBlock[] | 图片和文字共用的正文顺序；最多 30 块；发布至少一非空块 |
| relatedWorkIds | string[] | 最多 3 项、排除自身、无重复；保存草稿可以后补，发布只允许有效公开作品 |

用户可见字符按字素簇计数，后端为准；文本纯文本渲染。首图也属于一个图片内容块，单图作品可以发布，不另要求再上传第二张图。

## 6 图片内容块字段

blocks 是图片、文字的唯一顺序来源。图片筛选列表从 blocks 派生，不再存第二份 images 数组或独立图片排序。

| 字段 | 类型 | 必填 | 功能 |
| --- | --- | --- | --- |
| id | string | 是 | 这张图在该作品中的使用编号，例如 wi_001；coverImageId 指向它 |
| type | string | 是 | 固定 image |
| sortOrder | integer | 是 | 在所有正文块中的顺序；从 1 连续递增 |
| assetId | string | 是 | 实际图片资源编号；换首图不改变它 |
| alt | string | 发布时是 | 1–200 字替代文字，可先用作品标题预填 |
| caption | string | 否 | 0–200 字图注，默认空 |

文字块字段为 id、type=text、sortOrder、text；非空文字块最多 3000 字。type 区分两种块，不允许 image 块同时携带另一份正文 text。

管理界面响应可额外计算 isCover = block.id == coverImageId、imageNumber 为过滤图片后的顺位；两者不重复写入 JSON，避免出现两张图都标记首图。sortOrder 是实际存储顺序，imageNumber 只是界面“第几张图片”，中间文字块不会被算作图片。

## 7 首图与顺序的操作规则

| 操作 | 数据变化 | 页面结果 |
| --- | --- | --- |
| 第一次上传并加入作品 | 创建图片块、sortOrder=1，原有文字块顺延，并自动设置 coverImageId | 默认成为首图 |
| 后续图片加入 | 添加到 blocks 末尾，分配下一 sortOrder | 默认其他图片，排在已有内容之后 |
| 点击“设为首图” | coverImageId 改为目标块 id；将目标块移到 blocks 首位，其余块保持相对顺序，重新编号 | 新图用于首页/列表封面与详情顶部主图 |
| 拖拽或上移下移 | 提交完整 orderedBlockIds；服务端按顺序编号 | 正文与图片放大按新顺序；首图块固定首位，其他块不越过它 |
| 删除其他图片 | 从 blocks 移除，剩余顺序连续编号 | 不删除实际图片文件 |
| 删除首图 | 有其他图片时，确认后将顺序最靠前的剩余图片移到blocks首位并重编号，提升为首图；没有图片则清空 coverImageId | 可继续保存草稿，没有首图不能发布 |
| 替换图片内容 | 对该块更换 assetId，id 和位置保留；若是首图，重置并确认裁剪与焦点 | 新上传文件不覆盖原文件，旧公开版不受影响 |
| 同一图片文件用于多个作品 | 多个图片块引用同一 assetId | 各作品首图和排序彼此独立 |

所有更换首图来源的动作，包括首次设首图、设另一图为首图、删除后提升与替换首图文件，都重新生成新图的居中3:4 coverCrop 与 {x:0.5,y:0.5} coverFocal，展示预览供调整，不沿用旧首图参数。若删除后已无图片，两字段与coverImageId一起清空。

默认裁剪按方向矫正后的像素宽W、高H计算：令r=W/H、t=3/4；r>=t时裁剪比例cw=t/r、ch=1，否则cw=1、ch=r/t；最终crop={x:(1-cw)/2,y:(1-ch)/2,width:cw,height:ch}，确保居中且实际像素比例为3:4。

首图块必须为 blocks 第一项且 sortOrder=1；这是一条明确约束，其他块按 2、3… 排序。更换首图是一次草稿操作，必须“保存→发布”才对访客生效。内容块排序与全站作品 sortOrder、首页手选 workIds 的顺序是三种不同的业务顺序。

详情主图区使用首图块，正文从剩余 blocks 开始渲染，不把首图重复输出；放大图片列表为全部 image 块按 sortOrder 过滤，首图第 1 张、不循环。图注显示在对应图片下。单图作品只有顶部主图，没有虚构的空白正文区域。

例如原顺序为 A首图、文字T、B、C；设 C 为首图后为 C首图、A、文字T、B，其他块的相对顺序不变。若只想让 B 在 A 前面，先将 B 设为首图；普通排序不偷偷改变封面标记。

上传成功只进入当前页面的待用资源列表；用户加入作品后才产生图片块。取消上传或重传后，旧回调不能再自动添加块。第一张图的自动设首图只在加入作品时发生，不是文件刚上传成功就修改服务器草稿。

## 8 图片资源 Asset 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | 实际资源编号 |
| publicToken | string | 是 | 随机媒体访问标识，接口仍需检查是否公开引用 |
| originalName | string | 是 | 仅管理显示的原始文件名，不用来拼磁盘路径 |
| format | enum | 是 | JPEG、PNG、WEBP |
| mimeType | string | 是 | 校验后的真实类型 |
| byteSize | integer | 是 | 原文件字节数，最多 20,000,000 |
| width、height | integer | 是 | 方向矫正后的像素宽高 |
| originalPath | string | 是 | 相对路径，如 images/originals/asset_001.jpg |
| displayImages | DisplayImage[] | 是 | 至少一个已生成显示图 |
| createdAt | string | 是 | 上传并处理完成时间 |

DisplayImage 字段：size（目标最长边档位 480/960/1600/2560）、path（相对路径）、width、height、mimeType、byteSize。小图不放大；没有实际生成的档位不登记。

一个 Asset 没有“首图角色”和“作品排序”字段，因为它可被复用。角色与顺序属于作品的图片内容块。封面、正文、站点横幅指向同一文件也可以采用不同呈现规则，不搬文件或覆盖原图。

图片校验通过、原图和显示图全部落盘后，才登记 Asset。处理失败重传，允许留下无引用副本，首期不自动永久清理。

## 9 分类 Category 字段

| 字段 | 类型 | 默认与要求 |
| --- | --- | --- |
| id | string | 稳定编号 |
| name | string | 1–20 字，规范后全站唯一 |
| slug | string | 小写网页标识，创建后固定、不复用 |
| sortOrder | integer | 分类栏顺序，1 开始 |
| enabled | boolean | 默认 true；停用不允许新增关联 |
| system | boolean | 默认 false；“其他”为 true，不可停用删除 |
| revision | integer | 修改版本，防止覆盖 |
| deletedAt | string 或 null | 逻辑删除；名称和标识保留供当前快照解释 |
| createdAt、updatedAt | string | 创建与修改时间 |

分类改名、停用和顺序直接生效。原有停用分类可保留在作品或首页中，判断依据为已保存旧值。删除前扫描所有当前作品草稿、当前可见公开版、配置草稿和配置公开版；有引用就提示数量与处理入口。

## 10 网站配置 SiteConfig 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| draftRevision、stateRevision | integer | 配置保存和状态版本 |
| catalogRevision | integer | 全局作品集合或作品顺序改变时增加 |
| draft.content | SiteContent | 当前配置草稿 |
| published | object 或 null | version、sourceDraftRevision、publishedAt、content 的当前公开配置 |
| updatedAt | string | 最后修改时间 |

### 10.1 品牌与关于联系

| SiteContent 路径 | 类型 | 说明 |
| --- | --- | --- |
| brand.name | string | 1–30 字 |
| brand.logoAssetId | string 或 null | 标志，首期透明 PNG 即可 |
| brand.tagline | string | 简短品牌描述 |
| about.description | string | 品牌介绍，空则隐藏 |
| about.mainAssetId | string 或 null | 关于主图 |
| about.teamImages | object[] | 最多 6 项，每项 assetId、caption，数组顺序为显示顺序 |
| contact.email | string | 公开邮箱，可空 |
| contact.address | string | 可选公开地址 |
| contact.links | object[] | 最多 5 项，每项 label、url，仅 HTTPS |

### 10.2 首页九个区块

homepage 使用固定 key，后台不能随意改区块顺序。各对象都有 enabled；H01、H02、H09 固定 true，H03–H08 可关闭。

| 路径 | 主要字段和类型 | 作用与上限 |
| --- | --- | --- |
| homepage.hero | title:string、description:string、workIds:string[] | H01；标题最多40字、说明120字、作品8项 |
| homepage.featured | title:string、description:string、workIds:string[] | H02；精选5项 |
| homepage.banner | assetId:string/null、desktopFocal:Point、mobileFocal:Point、linkedWorkId:string/null、logos:object[] | H03；两端焦点独立；标志最多12个，每项assetId和可选url |
| homepage.statement | text:string、decorationWorkIds:string[] | H04；文字120字、装饰作品最多3项 |
| homepage.categories | categoryIds:string[] | H05；最多4个；数组顺序是首页入口顺序 |
| homepage.gallery | workIds:string[] | H06；最多16项；数组顺序是画廊顺序 |
| homepage.cases | items:object[] | H07；最多3项，每项workId、summaryOverride最多80字 |
| homepage.capabilities | items:object[] | H08；最多3项，每项title最多20字、description最多100字 |
| homepage.closing | title:string、showDecoration:boolean、iconKeys:string[] | H09；装饰图标最多8项，iconKeys取固定图标名star/circle/diamond/wave/flower/arrow |

Point 为 {x:number,y:number}，范围0–1。卡片和画廊的封面读取相应作品已发布内容的 coverImageId，不能读作品草稿。品牌联系信息只取 contact 一份，不在页脚和首页各存邮箱。

## 11 一个作品的完整示例

示例为管理存储对象，公开接口会移除内部编号、草稿和磁盘路径。三个资源引用值在 assets 中应有对应记录。

```json
{
  "id": "work_001",
  "publicKey": "p_001",
  "lockedSlug": null,
  "draftRevision": 2,
  "stateRevision": 2,
  "draft": {
    "content": {
      "title": "纸巾包装设计",
      "slug": "tissue-packaging",
      "categoryId": "cat_packaging",
      "summary": "示例项目简介",
      "client": "",
      "year": 2026,
      "role": "包装设计",
      "coverImageId": "wi_001",
      "coverCrop": {"x": 0.125, "y": 0, "width": 0.75, "height": 1},
      "coverFocal": {"x": 0.5, "y": 0.5},
      "blocks": [
        {"id": "wi_001", "type": "image", "sortOrder": 1, "assetId": "asset_001", "alt": "包装主视觉", "caption": "首图"},
        {"id": "tb_001", "type": "text", "sortOrder": 2, "text": "项目背景与设计思路。"},
        {"id": "wi_002", "type": "image", "sortOrder": 3, "assetId": "asset_002", "alt": "包装展开细节", "caption": "展开图"},
        {"id": "wi_003", "type": "image", "sortOrder": 4, "assetId": "asset_003", "alt": "包装应用场景", "caption": "应用图"}
      ],
      "relatedWorkIds": []
    }
  },
  "published": null,
  "visible": false,
  "sortOrder": null,
  "recycledAt": null,
  "lastPublishedAt": null,
  "createdAt": "2026-10-27T06:00:00Z",
  "updatedAt": "2026-10-27T06:10:00Z"
}
```

示例封面裁剪假设资源已矫正方向后为正方形；实际图片需由宽高校验裁剪后3:4，不能把示例坐标硬套所有横竖图。详情不应用这个封面裁剪矩形。

文件最外层形状为：

```json
{
  "schemaVersion": 1,
  "dataRevision": 1,
  "updatedAt": "2026-10-27T06:00:00Z",
  "works": [],
  "assets": [],
  "categories": [],
  "site": {}
}
```

此段只展示容器形状，不是可启动的初始配置；正式初始化必须创建“其他”分类并补齐 site 的版本与默认字段，不能把空示例直接当生产文件。

## 12 文件写入与读取规则

1. 启动先获得独立store.lock的排他锁，再加载 store.json、校验结构和所有逻辑引用，建立只读内存快照与按id/slug索引。已有文件损坏时提示恢复备份，不静默重置为空站。
2. 所有写请求在一个进程内写锁下进行；读取捕获当前内存快照，不能拿会被保存动作原地修改的对象。
3. 检查目标版本，在独立副本上修改、验证唯一性和图片引用；dataRevision递增。草稿和published.content必须深复制。
4. 将完整新JSON写到同目录临时文件，关闭前强制刷写；用已验证支持的原子替换操作切换store.json，成功后一次替换内存引用，再返回成功。
5. 进程重启从正式store.json读取；未替换的临时文件不参与启动恢复。单实例文件锁使用独立store.lock，第二个写进程拒绝启动。

同目录原子替换需要在最终运行磁盘上测试。若不支持，拒绝写入并提示配置问题，不退回“直接清空原文件再写”。这是防止一次保存损坏整个站点文件的基本措施，不是分布式事务。极端断电不承诺零数据损失，仍依靠备份。

发布在同一个新Store副本中建立当前公开快照、更新visible和目录顺序，一次落盘后生效。保留原版“当前已公开同源修订可无修改返回，否则验证stateRevision”的顺序，旧发布请求不能推翻后续下架。不再存在数据库事务或外键。

## 13 接口变化与输入输出

| 接口 | 关键输入 | 关键输出或处理 |
| --- | --- | --- |
| POST /api/admin/v1/assets | 一个文件 | Asset管理摘要及显示图地址；不自动保存作品 |
| PUT /api/admin/v1/works/{id}/draft | expectedDraftRevision、完整WorkContent | 新draftRevision、stateRevision；校验coverImageId和所有sortOrder |
| POST /api/admin/v1/works/{id}/cover | imageId（图片块id）、expectedDraftRevision | 一次保存首图提升和顺序；返回完整新草稿及版本 |
| PUT /api/admin/v1/works/{id}/block-order | orderedBlockIds、expectedDraftRevision | 必须是完整当前块集合、无重复，首图固定第一；服务端重新编号后一次保存 |
| POST /api/admin/v1/works/{id}/publish | targetDraftRevision、expectedStateRevision | 同步发布结果，只有落盘成功才成功 |
| POST /api/admin/v1/works/{id}/unpublish | expectedStateRevision | 同步下架，增加状态和目录版本 |
| GET /api/public/v1/works/{slug} | 访问标识 | 一个published内容、已映射媒体地址、按sortOrder排列的正文与图片浏览数据 |
| GET /api/public/v1/works/catalog | 无 | 当前全部公开publicKey有序数组与分类 |
| POST /api/public/v1/works/browse | orderedPublicKeys、categorySlug、take | 当前有效前缀、总数、分类计数、hasMore |
| GET /media/{token}/{size} | 随机媒体令牌和显示档位 | 扫描当前公开作品与配置引用，允许后读显示图，不公开原图目录 |

首图和排序两个快捷接口仅适用于当前编辑器没有未保存改动；有未保存改动时先在前端合并到完整WorkContent，再走统一draft保存，不能让一个快捷请求覆盖其他输入。

其余接口保持创建、分页管理20项、回收恢复、分类维护、网站配置保存发布、当前修订预览和登录退出。公开列表每批12项；切换分类重取catalog并将take重置12；从详情返回恢复原序列再重新取数。take上限1200、序列上限5000、JSON请求上限256KB为首期查询保护值，不涉及服务器浏览会话。

字段非法422，版本冲突409，未登录401，无权限/CSRF失败403，不可见404，文件过大413，服务器忙或存储失败503。响应丢失提示刷新确认，不自动循环提交。公开错误不返回草稿是否存在和文件路径。

## 14 数据模型验收

- 一个作品只有一个coverImageId，且它引用首位image块；设置C为首图后，封面、详情主图、放大首张同时为C。
- 图文块排序只有一个sortOrder来源；非首图移动不改变首图，删除首图有明确提升或清空结果。
- 两个作品复用同一Asset时，各自封面与顺序独立，磁盘文件位置不变化。
- 只保存草稿不改变published，内存对象深复制不能漏；重启后可恢复这两份不同内容。
- 文件写入失败不替换当前内存，也不反馈保存成功；读取只拿完整旧快照或完整新快照。
- 发布后下架，重放旧状态发布请求不重新上线；分类删除仍扫描当前有效引用。
