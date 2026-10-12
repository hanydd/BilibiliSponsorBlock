# 配置 OTA

远程配置集中放在仓库根目录 `ota/` 中。后端自动读取这个目录，主站和镜像提供同一个 `GET /api/ota` 接口。扩展复用现有服务器配置和健康状态，从 HTTPS 节点发起 OTA 请求。

## 配置文件

目录只发布直接位于其中的 JSON 文件，不递归扫描子目录。文件名使用字母开头的英文标识，例如 `sponsorRegex.json`。每个文件包含：

```json
{
    "schemaVersion": 1,
    "data": {
        "enabled": true
    }
}
```

`data` 的结构由对应配置类型定义。现有正则配置见 `ota/sponsorRegex.json`。修改规则仍遵循现有的逐条版本更新约定。

后端把各文件包装为 `{"schemaVersion":1,"configs":{"文件名去掉扩展名":文件内容}}`。扩展在 `src/requests/background/sponsorRegexConfigUpdate.ts` 应用支持的类型，目前只有 `sponsorRegex`。新增 JSON 文件会自动进入接口；扩展支持一种新类型时，还需增加它的校验器和应用逻辑。未知类型不会应用，也不会覆盖用户配置。

## 发布与获取

提交前运行：

```sh
npx ts-node scripts/validate-ota.ts
```

CI 同样执行该检查。后端从固定仓库 `hanydd/BilibiliSponsorBlock` 的 `master` 分支读取 `ota/`，文件按同一份 Git tree 的对象 SHA 下载。合并配置目录改动后，无需为已有类型单独发布扩展。

主站和 HTTPS 镜像分别启用后端的 `ota.enabled`。后端启动时在后台预热缓存，文件最多并发下载 4 个，整轮下载预算为 12 秒。请求共用预热或触发刷新，成功后缓存一小时；已有缓存时立即响应并在后台刷新，失败后十五分钟才允许再次刷新。扩展自动检查间隔为 24 小时，失败后 6 小时重试。手动检查有 5 分钟最小间隔，并发检查共用一次请求。扩展在开始下载前保存检查时间，后台中途退出后也不会立即重复拉取。

自动和手动检查都在 background service worker 中执行。设置页通过 `checkSponsorRegexConfigUpdate` 消息触发检查，不导入后台请求模块。保留原来的函数名和 `lastSponsorRegexConfigCheck`、`lastSponsorRegexConfigCheckFailed` 存储字段。

下载使用普通 API 共用的 `callAPI("GET", "/api/ota", ...)`，沿用同一个节点健康状态、超时和恢复流程，没有额外的 OTA 健康检测。每轮最多请求当前节点和一个备用节点。

通用请求的最后一个参数 `clientOptions` 仅控制本地行为，与请求数据、缓存开关和请求头分开。OTA 显式设置 `retry: true`、`maxResponseBytes: OTA_MAX_BYTES`、`recordFailure: false`、`switchOnRetrySuccess: false` 和响应校验。失败仍会触发备用重试，但不会记录节点失败；备用成功不切换普通 API 的活动节点。当前接口由 Node 服务处理，成功仍参与节点恢复计数。

校验回调只判断响应是否可用。失败时 `callAPI` 返回 `ok: false`，保留原始 HTTP 状态和正文，因此 HTTP 200 也可能表示本地校验失败。OTA 入口检查最终返回值，成功后解码正文并显式应用支持的配置类型。

其他请求默认沿用原有重试策略、失败记录和备用成功后的节点切换。

## 限制与失败处理

- OTA 通过 `httpsOnly: true` 选择 HTTPS 节点，重定向沿用普通 API 的行为。
- 后端固定 GitHub 来源，不接受客户端传入 URL 或路径。符号链接、子模块、越界路径和截断的目录响应不能发布。
- 最多 32 个配置文件，每个文件最多 64 KiB，整个响应最多 256 KiB；下载期间检查字节数并设置超时。
- 后端和扩展拒绝危险属性名；JSON 深度上限为 32，统一从完整响应根计算，包含两层配置包装。已注册类型还有专门校验，正则包括语法、数量、长度和 ID 唯一性检查。
- 后端刷新失败保留完整旧缓存；扩展拉取失败则保留现有规则或随包默认值。

`test/otaStreaming.test.ts` 单独验证低带宽分块响应和停滞超时，`test/entryImports.test.ts` 检查页面入口之间的运行时导入关系，防止 options 或 background 意外引入 `content.ts` 的初始化代码。

本实现使用 HTTPS，不使用配置签名，因此信任仓库维护者和所配置的 HTTPS 服务。正则语法检查不保证其运行耗时安全，发布者仍需审查复杂正则。OTA 只保存远程默认规则，用户自定义设置继续优先。服务器地址、用户身份和执行代码不能通过通用配置合并被远程修改。
