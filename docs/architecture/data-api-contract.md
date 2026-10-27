# 作品展示网站数据与接口契约

版本 1.0 · 2026-10-27 · 简化首期。对应[技术主方案](../superpowers/specs/2026-10-27-portfolio-technical-design.md)。本轮未实现接口；发布采用同步事务，失败由维护者刷新或重试，不保留任务队列和操作中心。

## 1 数据表和职责

首期 9 张业务表，不建立上传队列、发布任务、浏览会话、会话共享或媒体加工任务表。时间以 UTC 存储，接口使用 ISO 8601。

| 表 | 主要字段 | 约束和用途 |
| --- | --- | --- |
| work | id、public_key、draft_json、draft_revision、state_revision、locked_slug、current_publication_id、visible、last_published_at、recycled_at、sort_rank | 内部编号与公开编号分离；首次发布锁定 slug；当前草稿、状态和公开指针 |
| work_publication | id、work_id、source_draft_revision、content_json、category_id、category_name_at_publish、published_at | work_id 与 source_draft_revision 唯一；完整不可变快照 |
| site_config | id=1、draft_json、draft_revision、state_revision、current_publication_id、catalog_revision | 品牌与首页配置、排序集合版本；短写事务的首个行锁 |
| site_publication | id、source_draft_revision、content_json、published_at | 源修订唯一；品牌、关于、页脚同一配置版本 |
| category | id、slug、name、normalized_name、enabled、rank、system、revision、deleted_at | 名称规范键唯一；slug 固定不复用；其他分类不能停用删除 |
| asset | id、public_token、original_path、variants_json、width、height、mime、bytes、created_at、ever_published | 原图与显示图位置；所有文件完成后才插入可用记录；令牌随机且唯一 |
| work_asset_ref | work_id、asset_id、scope | scope 为 DRAFT 或 CURRENT_PUBLIC；真实外键；同组合唯一 |
| site_asset_ref | config_id、asset_id、scope | 当前配置草稿与公开配置引用；真实外键 |
| audit_log | actor、action、object_type、object_id、revision、created_at | 保存、发布、下架、回收和配置操作记录；无额外日志页面 |

work_publication.category_id 保留分类身份，类别显示使用当前字典名称；历史分类名称用于审计。分类逻辑删除不物理删行，外键仍有效。所有快照按追加方式保存，不原地修改。

图片历史快照可通过 JSON 保留引用；首期不自动删任何 asset 或文件，因此当前引用表不用于判定历史图能否永久删除。它们只服务管理引用查询和公开媒体授权。人工清理也必须核对全部快照，不能只查当前引用表。

必要索引为 work 的 public_key 和 locked_slug 唯一、work_publication 的作品加源修订唯一、分类规范名与 slug 唯一、asset.public_token 唯一、当前引用的 asset_id 与 scope，以及 work 的 visible、sort_rank、category 查询连接。业务读量较小，先用这些索引，不建设额外索引平台。

## 2 版本和事务

- draftRevision：每次成功保存增加，防止两个标签页互相覆盖。
- stateRevision：作品每次保存、发布、下架、回收或恢复均增加，防止旧状态命令重新生效。
- catalogRevision：首次上线、重新上线、下架和全局排序改变时增加，保护完整排序保存。
- 配置具有自己的 draftRevision 与 stateRevision，不与作品草稿共用版本。

关联内容写事务统一先锁 site_config 的单例行，再锁目标作品或分类，校验并提交。一个维护者的写量很小，用同一短写锁简化分类、引用和排序竞争；上传文件处理不持有该锁。事务超时目标 5 秒、锁等待 3 秒，不能在锁内解码图片或写文件。

### 2.1 草稿保存

请求带 expectedDraftRevision，条件更新只允许匹配修订成功；同事务更新当前资源引用及操作记录。草稿结构、上限和资源存在性始终校验；业务必填缺失允许暂存。保存失败不覆盖已有内容。

响应丢失时刷新读取草稿并对照当前输入。再次保存过期修订返回 409，维护者复制本地内容后刷新处理。首期不做自动合并、保存请求去重或跨设备离线同步。

### 2.2 发布判断顺序

在同一写事务内执行：

1. 检查维护者和对象没有在回收区。
2. 若对象当前可见，且当前公开快照的 sourceDraftRevision 等于本次目标修订，返回该已有公开结果，不改任何状态和顺序。
3. 否则要求 expectedStateRevision 匹配，目标 draftRevision 等于当前草稿修订，并执行发布必填和资源检查；不匹配返回 409。
4. 查找或创建该源修订的不可变快照。切换公开指针、visible、lastPublishedAt 与当前图片引用；需要上架时追加排序；增加状态和目录版本，写审计后提交。

这里第 2 步只允许“当前仍公开的同修订”作为无修改成功；当前已下架时不能跳过状态版本检查。例：发布前状态 10，发布后 11，下架后 12；旧发布请求仍带 10，应返回 409，不能重新上线。维护者主动重新上架需要刷新后携带 12，可复用该内容快照，再生成新的状态版本。

lastPublishedAt 记录本次主动发布或重新上架时间；快照中的 publishedAt 保留该快照首次创建时间。无修改重复请求不改这些时间。

配置发布同样基于目标草稿修订、期望状态和唯一源修订快照。没有外部图片操作需要与数据库事务协调；文件准备在上传时结束。

### 2.3 下架与排序

下架在状态版本匹配时将 visible 设 false，删除当前公开引用和排序位置并增加版本。已经不可见时返回当前状态，不再次变化。回收恢复仍保持不可见，locked_slug 继续占用，旧收藏地址不能转给另一作品。

排序提交完整当前公开 workId 集合和 expectedCatalogRevision。锁内校验无重复、缺项或额外项，交换名次时使用可延迟唯一约束或临时 rank 区间，避免中间值冲突。失败整体回滚，刷新服务器顺序后重排。

## 3 内容与校验

作品草稿包含 schemaVersion=1、title、slug、categoryId、summary、client、year、role、cover、blocks、relatedWorkIds。图片块只保存资源编号、图注和替代文字，不接受任意远程图片 URL。文字作为纯文本显示。

| 字段 | 规则 |
| --- | --- |
| title | 发布必填，1–60 字，不是纯空白 |
| slug | 3–80 位，小写字母数字与连字符；首尾不为连字符；唯一且首次发布后固定 |
| summary、client、role | 分别最多 200、60、100 字 |
| year | 可空；整数 1900 至当前 UTC 年后 1 年 |
| cover | 成功资源；归一化裁剪矩形与焦点在边界内；发布必填 |
| blocks | 最多 30；只支持纯文字和单图；发布清理空文字块后至少 1 块 |
| text | 每非空块最多 3000 字，保留换行 |
| image | 图注最多 200 字，替代文字 1–200 字 |
| relatedWorkIds | 最多 3 个、排除自身、无重复；发布时仅引用公开作品 |
| 作品图片数 | 封面和正文资源去重最多 30 张 |

字符数按 Unicode 字素簇计数，前后端使用同一批边界样例验证；后端为准。保存时统一 NFC 与换行，不删除正文有意义的空行。

配置字段和上限沿用需求：首屏 8、精选 5、案例 3、画廊 16、首页分类 4、能力 3、合作标志 12、外链 5、团队图 6。新增作品引用必须已公开；历史引用后来下架则在读取时过滤并按模块降级。启用能力项缺标题或正文等自身必填问题阻止发布；不会把被引用草稿顺便上线。

停用分类的旧关联由持久化旧草稿或配置判断，不能由客户端声称自己是旧关联。删除只检查当前作品草稿、当前公开作品、当前配置草稿和公开配置；历史快照不阻止逻辑删除。

## 4 图片落盘与呈现

POST 上传一张文件，multipart 表单请求上限留出协议开销，文件本体严格不超过 20,000,000 字节。后台仅允许维护者上传；校验扩展名、魔数、解码格式、宽高和总像素。拒绝 SVG、动画图、无法解码的 WebP、截断文件和超限输入。Java ImageIO 加 TwelveMonkeys，实施时必须验证实际静态 WebP 及带色彩配置 JPEG。

上传先写同一持久磁盘的临时目录，校验后规范方向、生成显示图，最后原子移动到随机资源目录。所有文件就绪后才插入 asset；数据库写入失败可能留下无引用目录，接受后续人工清理。文件在数据库确认前不产生公开引用，不会半上传上线。

原图保留；显示图重新编码并转为 sRGB，清理相机与定位元数据。JPEG 显示图用 JPEG，含透明度的图使用 PNG；不承诺 WebP 输出。档位最长边不超过 480、960、1600、2560，小图不放大。封面优先选够清晰的档位；详情图片用原比例显示，不能套 3:4 裁剪。

封面 crop={x,y,width,height} 为方向矫正后坐标的 0–1 比例；要求裁剪后像素宽高比为 3:4。封面容器比例 3:4、overflow:hidden，内部图像相对容器的宽为 100/width%、高为 100/height%、left 为 -100*x/width%、top 为 -100*y/height%；不再叠加 object-fit 裁剪。以 3 个不同横竖素材验证矩形映射。横幅使用独立的桌面和手机焦点配合各自固定容器，详情不用 crop。

同一个浏览器队列项只接受最后一次有效请求返回；取消或重试后旧回调被忽略。服务器不持久化队列，也不自动把文件加入作品。超时重传可能产生多份资源，只有明确保存的那份被绑定；这不影响公开内容。

## 5 公开 API

基础路径 /api/public/v1。响应只包含公开 publicKey、slug 与已解析的显示字段，不含内部 workId、草稿或文件系统路径。

| 接口 | 输入和输出 |
| --- | --- |
| GET /site | 同一次读取得到品牌、关于、联系和首页已解析区块，包含 siteVersion |
| GET /works/catalog | 当前全部公开 publicKey 有序数组与分类字典，用于建立标签页浏览顺序 |
| POST /works/browse | orderedPublicKeys、categorySlug、take；返回前 take 张当前有效卡片、总数、分类计数、hasMore |
| GET /works/{slug} | 一个完整快照、当前分类名、最多 3 个当前有效推荐 |
| GET /media/{publicToken}/{size} | size 为生成过的固定档位；查询当前公开引用后流式读文件 |

browse 请求 take 从 12 开始，每次加 12；最大 1200，更多时提示刷新或采用后续分页方案。orderedPublicKeys 最多 5000 个且去重，请求 JSON 上限 256 KB。这是首期查询保护值，站点接近 1000 件作品时先测量再调整，不把它包装为大规模分页系统。

服务端先验证每个 publicKey 当前是否公开，再按传入的固定顺序和当前分类取前 take 项；不按客户端编号直接读取草稿。传入顺序可被访客在自己的浏览器中修改，但不会影响全站排序，不需要给它签名。

总数与分类计数基于初始编号集合中当前仍公开的全量项目，不受 take 影响。每次返回整个已加载前缀，因此中途下架或分类迁移不会导致跨页重复与漏补；新作品和全站重排不改变当前编号集合。25 项自然返回 12、24、25，客户端按 publicKey 复用已有 DOM。

sessionStorage 只保存 orderedPublicKeys、分类、take、scrollY 和建立时间，最长 24 小时且不跨标签页共享。返回列表时用相同参数重新取数，等布局稳定后恢复位置。切换分类时重新请求 catalog、设置 take=12 并回到列表起点；刷新同样创建新编号集合。分类删除改回全部并提示。继续加载失败保留现有卡片，不把失败当成空结果。

公开数据和媒体 no-store；静态文件长缓存。公开页面组合查询在一个主库可重复读只读事务内完成，DTO 不拼新旧快照。公开媒体必须仍被当前 visible 作品或当前配置引用，共享资源只要仍有一个当前公开引用即可访问。不存在、草稿和下架详情统一 404。

## 6 管理 API

基础路径 /api/admin/v1。全部检查唯一维护者会话；写请求检查 CSRF。JSON 字段错误使用 422，未登录 401，无权限或防伪失败 403，版本冲突 409，文件过大 413，限速 429，临时故障 503。

| 接口 | 规则 |
| --- | --- |
| GET /works | 标题、分类、状态筛选，每页 20 项 |
| POST /works | 创建空草稿；客户端不自动重试，响应未知先查看列表 |
| GET /works/{id} | 当前草稿、draftRevision、stateRevision 与公开状态 |
| PUT /works/{id}/draft | expectedDraftRevision 与 content，成功返回新两个版本 |
| POST /works/{id}/publish | targetDraftRevision 与 expectedStateRevision，同步返回当前公开结果 |
| POST /works/{id}/unpublish | expectedStateRevision，同步下架 |
| POST /works/{id}/recycle | 仅未公开对象，带 expectedStateRevision |
| POST /works/{id}/restore | 恢复为未公开，带 expectedStateRevision |
| GET 与 PUT /work-order | 完整公开集合与 expectedCatalogRevision；无搜索筛选时操作 |
| GET 与 PUT /site/draft | 配置读取和条件保存 |
| POST /site/publish | 指定配置草稿修订、期望状态，同步发布 |
| GET、POST /categories | 读取字典与引用数；新增分类立即生效 |
| PUT、DELETE /categories/{id} | 期望分类 revision，改名停用或零当前引用时逻辑删除 |
| POST /categories/{id}/migrate | 目标分类、作品集合及各期望修订；更新草稿，仍须逐项发布 |
| POST /assets | 单文件同步上传，成功返回 READY 资源及显示图尺寸 |
| GET /assets/{id}/image/{size} | 登录后预览已成功资源，包括暂未绑定资源 |
| GET /previews/works/{id}?revision=n | 只接受当前已保存修订 n；已被新保存替代时 409 并提示重新预览 |
| GET /previews/site?revision=n | 当前保存配置预览，作品引用仍只读公开快照 |

分类迁移首期最多 100 件一批，在一个短事务中校验各草稿修订，全成功或全冲突；不做后台迁移任务。未上传完成的项不出现在已保存资源列表中，发布不推断浏览器队列状态。

管理预览路径 /admin/preview/works/{id}?revision=n 与 /admin/preview/site?revision=n，不是新增公开模板。未保存改动先保存，保存失败不能继续预览或发布。预览需会话，无长期分享地址。

认证为 GET /api/auth/csrf、POST /api/auth/login、GET /api/auth/session、POST /api/auth/logout。登录表单先取 CSRF，登录后会话更换并重新取 CSRF，保护业务写请求。登录成功返回本站允许的 /admin/ 相对路径，不接受外站回跳。

统一错误含 code、message、fieldErrors 和 requestId；管理冲突可额外带当前版本。公开错误不返回内部对象存在性、SQL 或堆栈。上传与发布超时由客户端提示刷新确认，不自动循环提交。

## 7 前后端目录建议

| 路径 | 内容 |
| --- | --- |
| apps/web/src/app | 公开、管理和预览页面 |
| apps/web/src/features | 首页、作品浏览、编辑、上传和设置 |
| apps/web/src/components | 导航、卡片、表单、图片放大和状态组件 |
| apps/api/src/main/java | 单一应用，按 identity、works、media、site、taxonomy、publicquery 分包 |
| apps/api/src/main/resources/db/migration | 9 张表的字段、约束与索引迁移 |
| contracts/openapi.yaml | 实施阶段固定接口字段，生成前端类型并检查变更 |
| infra | 容器、代理和简单备份恢复脚本 |

这些是开发目录约定，本轮不搭建代码骨架，也不安装依赖。
