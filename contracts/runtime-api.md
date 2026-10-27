# 本地文件网站运行接口

开发合同，2026-10-27。所有数据以已批准 docs/architecture/data-api-contract.md 为准；此文件只固定前后端响应形状。无关系数据库，单Java进程，项目storage目录。

## 认证

GET /api/auth/csrf -> {token,headerName:"X-CSRF-TOKEN"}，建立匿名session。POST /api/auth/login 用application/x-www-form-urlencoded username,password,_csrf，返回{authenticated:true,username}；错误401。登录后重新取得csrf。GET /api/auth/session -> {authenticated:true,username}或401。POST /api/auth/logout带CSRF。业务写JSON带X-CSRF-TOKEN。Cookie同源，local http profile可禁Secure；默认生产启用Secure。

## 公共数据

PublicImage={url,width,height,alt?,crop?,focal?}。PublicCard={publicKey,slug,title,summary,year,category:{slug,name},cover:PublicImage}。不得含workId、assetId、磁盘路径或draft。公开请求和媒体Cache-Control:no-store。

GET /api/public/v1/site -> {siteVersion,brand:{name,tagline,logoUrl?},about:{description,mainImage?,teamImages:[{image:PublicImage,caption:string}]},contact:{email,address,links:[]},homepage:{hero:{enabled,title,description,workIds,works:PublicCard[]},featured:{enabled,title,description,workIds,works:[]},banner:{enabled,image?,desktopFocal,mobileFocal,logos:[{image:PublicImage,url?:外链}],linkedWorkSlug?},statement:{enabled,text,works:[]},categories:{enabled,items:[{slug,name,works:[]}]},gallery:{enabled,works:[]},cases:{enabled,items:[{work:PublicCard,summaryOverride}]},capabilities:{enabled,items:[{title,description}]},closing:{enabled,title,showDecoration,iconKeys:[]}},categories:[{slug,name}]}。

GET /api/public/v1/works/catalog -> {orderedPublicKeys:string[],categories:[{slug,name}],catalogRevision:number}。
POST /api/public/v1/works/browse {orderedPublicKeys,categorySlug?,take:12} -> {items:PublicCard[],total,categoryCounts:Record<slug,number>,hasMore}。take为12倍数上限1200；keys最多5000。传入顺序可自定义但每个key必须重新过滤visible；不返回草稿。
GET /api/public/v1/works/{slug} -> {...PublicCard,client?:string,role?:string,blocks:[{id,type,sortOrder,text? ,image?:PublicImage,alt?,caption?}],relatedWorks:PublicCard[]}。blocks保留首图块为第一项，页面主图区渲染它，正文只渲染其余块；image字段已映射无assetId。
GET /media/{publicToken}/{size} -> 当前公开引用的显示图，不公开原图。size为已生成最长边档位。
GET /api/health -> {status:"UP"}不含私密配置。

## 管理

Work={id,publicKey,lockedSlug,draftRevision,stateRevision,draft:{content:WorkContent},published:null|{version,sourceDraftRevision,publishedAt,content},visible,sortOrder,recycledAt,lastPublishedAt,createdAt,updatedAt}。
WorkContent字段见方案，blocks图片{id,type:"image",sortOrder,assetId,alt,caption}、文字{id,type:"text",sortOrder,text}，coverImageId指向首位图片块。所有新增对象都由后端给默认字段。
GET /api/admin/v1/works?q=&categoryId=&state=&page=1 -> {items:Work[],total,page,pageSize:20}，state=draft|published|unpublished|recycled。
POST /api/admin/v1/works -> Work。GET /api/admin/v1/works/{id} -> Work。
PUT /api/admin/v1/works/{id}/draft {expectedDraftRevision,content} -> Work。
POST /api/admin/v1/works/{id}/cover {imageId,expectedDraftRevision} -> Work。
PUT /api/admin/v1/works/{id}/block-order {orderedBlockIds,expectedDraftRevision} -> Work。
POST /api/admin/v1/works/{id}/publish {targetDraftRevision,expectedStateRevision} -> Work。
POST /api/admin/v1/works/{id}/unpublish|recycle|restore {expectedStateRevision} -> Work。
GET /api/admin/v1/work-order -> {workIds:string[],catalogRevision}。PUT同路径{workIds,expectedCatalogRevision} -> 同形。
POST /api/admin/v1/assets multipart文件字段file -> {id,publicToken,originalName,format,mimeType,byteSize,width,height,displayImages:[{size,width,height,mimeType,byteSize,url}],createdAt,previewUrl}。GET /api/admin/v1/assets/{id}/image/{size} ->已登录可读显示图。
GET /api/admin/v1/assets -> {items:AssetSummary[]}供选择已有资源，不能匿名访问。
GET /api/admin/v1/categories -> {items:Category[]}含draftReferenceCount、publishedReferenceCount、siteReferenceCount。POST同路径{name,slug} -> Category。PUT /categories/{id}{expectedRevision,name,enabled,sortOrder} -> Category。DELETE /categories/{id}?expectedRevision=n -> {deleted:true}。POST /categories/{id}/migrate {targetCategoryId,works:[{id,expectedDraftRevision}]} -> {updated:number}。
GET /api/admin/v1/site/draft -> SiteConfig（draftRevision,stateRevision,catalogRevision,draft:{content},published,updatedAt）。PUT {expectedDraftRevision,content} -> SiteConfig。POST /api/admin/v1/site/publish {targetDraftRevision,expectedStateRevision} -> SiteConfig。
GET /api/admin/v1/previews/works/{id}?revision=n -> PublicDetail形状，但媒体为已授权管理路径；非当前保存版本409。
GET /api/admin/v1/previews/site?revision=n -> PublicSite形状，配置来自当前草稿，作品引用仍来自公开版。

错误体{code,message,fieldErrors?:[{field,message}],currentRevision?,requestId?}。冲突409、字段422、未认证401、CSRF/权限403、不可见404、文件过大413、忙503。前后端有任何合同疑问先通报协调者，不自行改响应。

收尾装饰iconKeys固定允许star/circle/diamond/wave/flower/arrow，最多8项，由前端友好选择并按类型显示，不接受任意脚本或图标路径。
