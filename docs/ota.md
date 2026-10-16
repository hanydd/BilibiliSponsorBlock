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

后端把各文件包装为 `{"schemaVersion":1,"configs":{"文件名去掉扩展名":文件内容}}`。扩展在 `src/requests/background/sponsorRegexConfigUpdate.ts` 应用支持的类型，支持 `sponsorRegex` 和 `servers`。新增 JSON 文件会自动进入接口；扩展支持一种新类型时，还需增加它的校验器和应用逻辑。未知类型不会应用，也不会覆盖用户配置。

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

本实现使用 HTTPS，不使用配置签名，因此信任仓库维护者和所配置的 HTTPS 服务。正则语法检查不保证其运行耗时安全，发布者仍需审查复杂正则。OTA 只保存远程默认规则，用户自定义设置继续优先。官方服务器地址仅通过已注册的 `servers` 类型更新本地快照；用户选择、用户身份和执行代码不会通过通用配置合并被远程修改。

## 官方服务器地址

`ota/servers.json` 与正则共用一次 `/api/ota` 下载、校验、节流和重试。它使用相同的 `schemaVersion` / `data` 包装，不另设 CDN 源或后台检查器。设置页现有的手动 OTA 检查也会更新官方服务器清单。

`data` 包含递增整数 `version` 和统一地址列表 `nodes`，主站也作为一条地址记录存放其中，不再单独设 `primary` 字段。每次变更地址、类型或删除节点，都要递增 `version`；客户端不会回退到旧版本。新地址在下载完成后的请求中生效。离线时使用缓存或随包清单。

运行时用 `ServerKind` 统一区分 `primary`（主站）、`mirror`（官方镜像）、`alias`（官方别名）和 `custom`（自定义镜像）。界面按当前官方清单判定角色，独立显示官方下发或用户手动配置的来源；手动选择官方别名作为首选地址时，仍标记为官方别名。默认主站为 `https://bsbsb.top`。

节点包含稳定的 `id`、`address` 和 `kind`。地址按列表顺序参与路由，过滤用户排除项后，第一条作为默认首选，其余作为备用；用户手动设置的首选地址优先。`kind` 只描述该地址的身份，不决定排序，也不要求某个分类必须存在。同一类型可以有多条记录。

例如：

```json
{
    "schemaVersion": 1,
    "data": {
        "version": 1,
        "nodes": [
            { "id": "official-primary", "address": "https://bsbsb.top", "kind": "primary" },
            { "id": "official-alias", "address": "https://bsbsb.cc", "kind": "alias" },
            { "id": "official-mirror", "address": "http://103.236.70.57:9876", "kind": "mirror" }
        ]
    }
}
```

`nodes: []` 是合法清单，表示没有官方地址。用户手动配置的地址仍保留；若也没有手动地址，请求返回失败，不会恢复已被清单撤下的官方节点，也不会导致配置初始化异常。

换域名时保留 ID，避免用户删除的节点重新出现；新增独立节点使用新 ID。地址只包含协议、主机和可选端口，不含账号、路径、查询参数或片段。

- `alias` 表示官方别名。目前 `https://bsbsb.cc` 在 DNS 层直接解析主站，不是独立镜像。
- `mirror` 表示独立镜像。目前为 `http://103.236.70.57:9876`。HTTP 镜像参与普通 API 路由，但不参与 OTA 下载。

官方快照只写入 local storage 的 `officialServers`。用户主站、手动地址和删除的官方节点 ID 单独保存在 sync storage 的 `serverPreferences`。手动保存主站会固定该地址，即使它等于官方地址；重置主站恢复跟随 OTA。重置备用地址清除手动列表和删除记录，使用最新官方清单。自定义主站默认停用官方备用节点，避免把自定义服务器的请求发送到官方服务。

迁移以固定的 0.16.0 历史地址和节点 ID 对照表为基准，只在尚无 `serverPreferences` 时执行，不依赖随包清单中的节点或类型。新版新增地址不会被误判为用户曾删除的节点；新版清单没有别名或为空时仍可完成迁移。旧版默认主站跟随 OTA，旧 `.xyz` 替换为 `.cc`，其余自定义地址保留。显式空列表保留，被删除的官方节点记录为排除项。旧版仅含 IP 的默认列表按历史默认配置迁移。旧存储没有编辑来源，无法区分用户手动填入的默认地址与原始默认值；迁移将已知官方地址视为官方配置，此后的手动编辑单独记录。

旧 `serverAddress` 和 `mirrorServerAddresses` 字段仅用于迁移。官方地址更新沿用后台请求与服务端 CORS 配置，不修改 manifest 的主机权限范围，也不为 OTA 下发的地址额外申请权限。OTA 通过当前生效的 HTTPS 节点获取清单；若所有这些节点都已下线，需要发布扩展更新内置清单，不能通过已失联的节点自救。
