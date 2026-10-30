# 个人贡献页

入口位于弹窗的“我的贡献 → 贡献日历”。页面打包在 `contributions/index.html`，通过现有后台 `openPage` 打开。没有新增权限、host 权限、内容脚本匹配或 web accessible resources。脚本和样式全部随插件打包。

## 交互

- 今日提交、今日被跳过次数、今日估算节省时长。
- 提交日历按年切换，固定颜色档位 0 / 1–2 / 3–5 / 6–9 / 10+。点击或方向键选择日期。左右移动一周，上下移动一天；提供可读日期和计数。
- 收获曲线支持 7 / 30 / 90 天，次数与时长切换。悬停或聚焦读取数值，点击选择日期。
- 左下展示近七日片段排行，默认跳过次数降序前十，可切换节省时长降序前十。服务端分别从完整候选集合中排序后取十条，避免只对同一批十条重排。每项显示已缓存的视频标题或视频编号、当前分P、片段范围和类型、跳过次数和估算时长，分P可确定时直接打开对应分P并定位时间；分P缺失时打开视频首页，不错误定位到第一P。右侧按日期查看类别汇总。已删除、隐藏、低票或不再是 skip 的片段不进入排行，历史收获仍在每日合计中。
- 支持浅色、深色，默认跟随插件设置并响应设置变化，刷新、加载失败重试和空数据状态。窄屏日历允许横向滚动。

设计参考：GitHub 的[日期点选](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/viewing-contributions-on-your-profile)、[键盘和读屏支持](https://github.blog/changelog/2023-03-02-accessibility-improvements-for-the-contribution-graph/)，以及 NN/g 的[渐进披露](https://www.nngroup.com/articles/progressive-disclosure/)。这些是设计依据，并非本站用户调研结果。页面优先让用户看清自己的贡献，不增加排行榜、连续打卡压力或成就系统。

## 与现有页面保持一致

使用设置页的中性灰背景、蓝色强调色、字体和控件尺寸：深色强调色 `#00a1d6`，浅色 `#008fbe`，按钮圆角 4px，页面标题 24px，分区标题 16px。日历和曲线统一使用蓝色，与官网品牌色一致。页面不加载设置页的全局 CSS，避免选择器干扰图表；颜色集中在贡献页样式顶部维护。默认跟随 `Config.config.darkMode`，本页手动切换不改变全局设置。

文案使用“我的贡献”“今日被跳过次数”“今日节省时长”“统计说明”等功能描述，移除宣传式标题和鼓励性口号。

## 数据口径

调用 `GET /api/contributionStats?publicUserID=<64位公开ID>&year=<年份>`。公开 ID 在本地通过既有哈希函数取得，私有 userID 不出现在该接口请求中。

提交日历来自数据库仍保留的 Bilibili 片段，包含隐藏或低票记录，删除的片段无法回填。因此它不是永久提交日志。收获按服务器接收跳过上报的北京时间日期计数，不代表独立观看人数；长度按采集端规则估算。两者日期含义不同，不用累计 views 作差分。

采集开始前返回 null，而不是 0；采集首日和今日标为部分数据。图表保持缺口，不插值补齐。七天仅是分类细节的展示范围，没有实施历史清理。当前不执行定时用户聚合，服务端以索引、日期边界和并发限制保护查询；复用现有 QueryCacher/Redis 按需缓存整份结果，最长五分钟。浏览器最多缓存一分钟，CF 使用同一截止点，不叠加缓存时长。切换年份、用户或跨午夜均隔离缓存，不新增插件端持久缓存。

## 本地验证

服务端工作树：`SponsorBlockServer/t3code-daily-skip-collection`。按服务端 `doc/Contribution-Stats-API.md` 启动专用 PostgreSQL、Redis 和 `scripts/contributions-dev.cjs`，监听本机 58040。演示账号明确命名为“TIME · 本地演示”。演示数据仅用于联调，不代表线上贡献。

插件从 `config.json.example` 创建 ignored 的 `config.json`，将 `testingServerAddress` 设为 `http://127.0.0.1:58040`，执行：

```sh
npm run build:dev
BSB_E2E_DIRECT=1 npx playwright test e2e/contributions.local.spec.ts
npx jest test/contributions.test.ts --runInBand
```

E2E 使用真实后台请求与真实 PostgreSQL 数据，没有拦截统计接口。覆盖入口、身份、热力图键盘操作、时长切换、七天详情、年份、窄屏、空数据与断网重试。截图输出到 ignored 的 `ignored/contributions/`。

发版前还需正式确定提交历史保留口径、汇总/清理方案、主站 API 路由及 collectionStartedAt 配置。本轮没有部署，也没有进行商店更新授权流程测试；manifest 产物比较与真实扩展加载只能证明本改动没有扩大声明权限。

服务端查询使用线上实际的 legacy `service=YouTube` 字段值，该值在本部署中表示 Bilibili 数据。CDN 响应头已实现，线上 CF Cache Rule 接入尚未执行。

## 上线前审查

- 页面使用版本化响应校验：用户、年份、90个日期点、计数、排行与类别结构都必须匹配。坏响应显示错误，不直接交给 React 渲染。
- 切换用户或服务器后自动清除旧数据并重载；返回页面或跨北京时间午夜时刷新。今日提交独立于日历年份。
- 统计请求有正文大小和超时限制，允许备用节点重试，但不因统计繁忙改变视频查询的全局节点选择。
- 缺失后台响应会拒绝 Promise，避免页面永久加载。
- 七日明细清理尚未启用，因此当前90天趋势不依赖尚未实现的长期聚合表。启用清理之前必须另行完成日汇总。

上线顺序为服务端迁移及配置、镜像回源规则、CDN规则校验、最后发布插件。不能仅根据本地联调通过就宣称线上已可用。
