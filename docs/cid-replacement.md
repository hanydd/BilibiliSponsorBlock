# CID 替换检测与片段迁移

插件在加载片段后异步检测同一 BV 的 CID 替换。只有本地正式 VIP 标识为真且存在私有 `userID` 时才会触发，最终权限和迁移结论由服务端决定。

## 触发条件

页面当前 `pages` 必须只有一个 P，BV、CID 和 P 序号与播放器 manifest 一致。检测读取当前页面状态，不使用导出功能累计的 CID map，也不额外调用 B 站 API。缺少页面信息、manifest、时长或多 P 时跳过。

旧 CID 从同一 BV 的片段查询结果中发现，不要求用户访问过旧版本。该 CID 已不在当前 pages 中，且其片段时长与当前 P 官方时长相差小于 1 秒。播放器时长也须符合这个容差；视频范围为 60–7200 秒。相同旧 CID 的片段合并为一个候选，有时长冲突时跳过该 CID。

这只是触发条件。插件不再通过原来的 5 秒相近时长规则直接使用其他 CID 的片段。普通播放列表和规则使用的原始片段均只接收当前 CID。

## 请求和刷新

后台通过已有 `callAPI` 请求路由发送 `POST /api/cidReplacement`：

```json
{
  "videoID": "BV1xx411c7mD",
  "oldCid": "1001001",
  "newCid": "1001002",
  "userID": "<privateUserID>"
}
```

凭证从后台配置读取，不传给页面脚本、不放入 URL、不写入冷却记录。仅使用 HTTPS 节点。官方镜像网关将此写请求和状态查询回源主站，镜像应用本身不执行迁移。自定义服务需要提供相同接口或网关转发。

POST 超时为 90 秒，禁止请求层自动重试或改换节点重发。MV3 后台仅在本次操作期间每 20 秒调用扩展 API，避免等待响应时因空闲被终止；操作结束即清理，最多持续 120 秒，依据 [Chrome 后台生命周期说明](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。持久化占位仍负责处理浏览器退出或其他意外终止。网络失败或 5xx 后最多进行一次 GET 状态查询，GET 超时为 15 秒，使用 `Authorization: Bearer <privateUserID>`。404 不意味着任务没有运行，不触发连续轮询。

只有响应 BV、旧新 CID 都匹配且 `status=migrated` 才刷新。`reason=segments_partially_migrated` 也刷新，但只重新请求原有片段接口，不按迁移响应自行构造片段。刷新跳过插件与服务端缓存；镜像复制或 CDN 仍可能有延迟，后续正常查询可看到新片段。

上报不阻塞片段加载。等待期间 BV/CID、播放器元素、媒体地址或页面 URL 改变后，旧回调不刷新当前播放。

## 去重和冷却

后台同一时刻最多一个上报，同一 BV 和目标 CID 的并发调用共享结果，其他视频不排队。一次只处理一个可上报旧 CID，优先较大的旧 CID。其余候选在后续正常片段查询时再判断，不开启定时任务。

本地 `chrome.storage.local` 的 `bsb_cache_cid_replacement_v1` 保存最多 200 个 CID 对及到期时间。账号和服务配置的哈希用于隔离冷却，私有 ID 不保存。上报前先持久化 10 分钟占位，存储失败则不请求；后台重启也不会立即重复 POST。

| 情况 | 扩展行为 |
| --- | --- |
| 不同候选 | 每次自动 POST 至少间隔 3 分钟，正常运行时每小时最多 20 次 |
| 完整或部分成功、拒绝、400/404/405/409/422 | 同一 CID 对至少冷却 24 小时 |
| 网络失败、证据不足、其他失败 | 同一 CID 对至少冷却 10 分钟 |
| JSON `retryAfter` | 按 Unix 毫秒读取，更晚的截止时间优先 |
| HTTP `Retry-After` | 按秒数或 HTTP 日期读取，更晚的截止时间优先 |
| 429、503、证据不足 | 同时延长所有候选的冷却，避免切换视频继续请求 |
| 403 | 停止当前账号与服务配置下的自动上报，不定时重试；更换账号或服务配置后重新检查 |

成功的部分迁移不授权剩余片段，也不证明两个 CID 永久等价。冷却过期后，仍必须从当前页面和片段重新判断候选。清理浏览器存储会清除本地限制，服务端的 VIP 校验、每 IP 限流、全局并发及 B 站出站限速仍有效。

## 代码和验证

- `src/utils/cidReplacement.ts`：候选条件与去重。
- `src/document/cidReplacementPage.ts`：页面当前 pages 与 manifest 核对。
- `src/content/cidReplacement.ts`：异步触发和播放上下文检查。
- `src/requests/background/cidReplacement.ts`：后台权限前置检查、请求、持久化去重与冷却。
- `src/content/segmentSubmission.ts`：严格按当前 CID 加载片段，迁移后重新获取。

服务端完整契约、算法和逐 UUID 事务行为见 SponsorBlockServer 仓库的 `doc/CID-Migration.md`。本地测试模拟接口，不需要真实后端或生产 VIP；先从 `config.json.example` 创建构建配置，再执行 `npm test`。
