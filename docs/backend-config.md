# 多后端配置

扩展默认使用仓库根目录的 `backends.json`。用户可以在设置页编辑配置，或者从订阅 URL 加载同样格式的 JSON。后端定义与运行时开关分开保存：JSON 中的 `enabled` 是默认状态，用户对单个后端的显式开关保存在独立的 `backendEnabledMap` 中。

## 配置 Schema

配置结构由仓库根目录的 [`backends.schema.json`](../backends.schema.json) 定义，采用 JSON Schema Draft 2020-12。它适合供编辑器和外部工具检查字段类型、必填字段、能力枚举、URL、数组去重以及递归的 `match` 表达式。

Schema 不替代扩展运行时的业务校验。后端 ID 唯一、`conflicts` 是否引用已存在的后端或自身、JavaScript 正则表达式是否合法，以及冲突关系的对称格式化仍由 TypeScript validator 和 normalizer 处理。

## 顶层结构

```json
{
    "backends": [
        {
            "id": "main",
            "name": "小电视空降助手",
            "desc": "BilibiliSponsorBlock 默认后端",
            "api_url": "https://www.bsbsb.top",
            "mirrors": [
                "https://www.bsbsb.xyz",
                "http://103.236.70.57:9876"
            ],
            "enabled": true,
            "capabilities": [
                "GET /api/skipSegments",
                "GET /api/skipSegments/:sha256HashPrefix",
                "POST /api/skipSegments",
                "POST /api/voteOnSponsorTime",
                "POST /api/viewedVideoSponsorTime",
                "GET /api/lockCategories",
                "GET /api/lockCategories/:sha256HashPrefix",
                "GET /api/videoLabels",
                "GET /api/videoLabels/:sha256HashPrefix",
                "GET /api/portVideo",
                "GET /api/portVideo/:sha256HashPrefix",
                "POST /api/portVideo",
                "POST /api/votePort",
                "POST /api/updatePortedSegments",
                "GET /api/chapterNames",
                "GET /api/userInfo",
                "POST /api/setUsername",
                "GET /api/getUsername",
                "POST /api/warnUser"
            ]
        }
    ]
}
```

`backends` 必须是数组，可以为空。数组顺序决定匹配优先级，越靠前优先级越高。后端 `id` 必须唯一，并且只能包含小写 ASCII 字母、下划线和短横线。

## 后端字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 后端唯一标识。 |
| `name` | string | 是 | 设置面板显示名称。 |
| `desc` | string | 否 | 后端介绍。 |
| `api_url` | string | 是 | API 根地址，必须是 `http` 或 `https` URL。 |
| `enabled` | boolean | 否 | 默认开关，省略时默认启用。 |
| `capabilities` | string[] | 是 | 后端支持的、插件实际会调用的 HTTP 接口。 |
| `match` | expression[] | 否 | 视频匹配规则；省略或为空表示匹配全部视频。 |
| `mirrors` | string[] | 否 | 与主地址提供相同能力的备用节点；节点故障时可接收当前请求的 fallback。 |
| `conflicts` | string[] | 否 | 与指定后端互斥；按数组顺序优先采用前面的后端，并抑制冲突的后置后端。 |

所有 URL 必须是 `http` 或 `https` URL。能力值不能重复，镜像地址不能重复，`conflicts` 不能引用自身或不存在的后端。

## Capabilities

Capabilities 表示插件实际依赖的 API 接口，不是服务端完整 API 清单。能力值包含 HTTP 方法和实际路径：

```text
GET /api/skipSegments
GET /api/skipSegments/:sha256HashPrefix
POST /api/skipSegments
POST /api/voteOnSponsorTime
POST /api/viewedVideoSponsorTime
GET /api/lockCategories
GET /api/lockCategories/:sha256HashPrefix
GET /api/videoLabels
GET /api/videoLabels/:sha256HashPrefix
GET /api/portVideo
GET /api/portVideo/:sha256HashPrefix
POST /api/portVideo
POST /api/votePort
POST /api/updatePortedSegments
GET /api/chapterNames
GET /api/userInfo
POST /api/setUsername
GET /api/getUsername
POST /api/warnUser
```

同一 API 的 GET 查询和 POST 提交是不同能力。例如，只有声明 `GET /api/skipSegments` 的后端才参与片段读取，只有声明 `POST /api/skipSegments` 的后端才参与片段提交。BVID 根路径和 SHA-256 前缀路径也是不同能力：`GET /api/skipSegments/:sha256HashPrefix` 不会被 `GET /api/skipSegments` 自动替代。

插件会根据当前功能块、HTTP 方法、实际路径、后端启用状态和视频 `match` 结果筛选候选后端。查询片段时，所有符合条件的后端都可以并行参与；提交、投票和其他单结果操作只选择符合条件的后端。显式指定 `backendId` 时仍会重新检查这些条件。

`mirrors` 是当前 backend 的备用节点，镜像地址不需要单独配置 capabilities，但必须实现该 backend 实际使用的接口。片段和标签等可合并查询会按健康状态尝试节点；其他安全 GET 和写请求在节点故障时最多 fallback 到一个可用节点。网络错误、超时、408 和 5xx 会更新节点健康状态；404 与业务型 4xx 会直接返回，不会被当成节点故障。

如果服务是纯只读镜像，不要把它放入可写 backend 的 `mirrors`。应使用独立的 backend `id`、仅包含 GET 能力，并放在可写 backend 后面。两个 backend 通过 `conflicts` 互相声明冲突；格式化配置时，编辑器会自动补齐缺失的反向声明。冲突按当前操作的候选后端生效，因此只读 backend 不会阻止写请求选择可写 backend：

```json
{
    "backends": [
        {
            "id": "main",
            "name": "Main backend",
            "api_url": "https://www.bsbsb.top",
            "capabilities": [
                "GET /api/skipSegments",
                "GET /api/skipSegments/:sha256HashPrefix",
                "POST /api/skipSegments"
            ],
            "conflicts": ["readonly-mirror"]
        },
        {
            "id": "readonly-mirror",
            "name": "Read-only mirror",
            "api_url": "https://readonly.example",
            "capabilities": [
                "GET /api/skipSegments",
                "GET /api/skipSegments/:sha256HashPrefix"
            ],
            "conflicts": ["main"]
        }
    ]
}
```

`/api/videoLabels` 和 `/api/chapterNames` 是插件实际调用的扩展接口，虽然当前 Wiki 页面没有列出，也必须在支持对应功能的后端中声明。`/api/warnUser` 位于官方文档的管理员操作章节，但插件实现了用户确认警告流程，因此保留该能力。

插件没有实现的接口不应加入 capabilities，包括 `/api/segmentInfo`、`/api/lockReason`、`/api/userStats`、排行榜、服务器状态以及其他管理员操作接口。官方 API 文档中列出的接口并不代表插件会自动支持它们。

官方接口路径与 HTTP 方法以 [BilibiliSponsorBlock API 文档](https://github.com/hanydd/BilibiliSponsorBlock/wiki/API) 为准。当前配置中的能力只覆盖插件实际调用的接口；新增插件功能时，应先增加对应能力注册和实现，再更新本文档与默认 JSON。

## 匹配规则

`match` 是表达式数组，顶层元素之间隐式执行 `and`。叶子表达式必须包含一个字段，以及 `exact` 或 `regexp` 之一：

```json
{
    "match": [
        { "field": "title", "exact": ["示例视频"] },
        { "field": "up_mid", "regexp": "^123" }
    ]
}
```

支持的字段为 `title`、`description`、`up_mid`、`up_name`。其中 `up_mid` 按字符串处理，以避免 B 站 bigint ID 的精度丢失。`exact` 是完全相等匹配；`regexp` 使用 JavaScript 正则表达式。

支持嵌套的 `and`、`or`、`not` 表达式。`and: []` 为真，`or: []` 为假。非法正则、未知字段或混合多个操作符会使整个配置校验失败。

## 优先级与冲突

后端按 JSON 数组顺序匹配。禁用、未匹配或已被冲突抑制的后端不会参与当前视频的匹配。当前后端的 `conflicts` 如果包含已经选中的前置后端 ID，则当前后端不会被选中；当前后端被选中后，会直接抑制其冲突列表中位于后面的 ID。因此 `main` 在前、只读镜像在后且双方冲突时，`main` 启用并符合当前操作会抑制只读镜像；禁用或不匹配的 `main` 不会阻止只读镜像参与读取。

冲突只作用于当前视频和当前匹配过程，不修改 JSON，也不会永久关闭后端。

## 合并片段

多个片段查询结果会合并到同一个视频：

- 相同 UUID 只保留优先级最高的片段。
- 同一 CID 上时间区间重叠时只保留优先级最高的片段。
- 不冲突的片段全部保留。
- 内部片段会附带 `backendId`，用于投票、观看统计和提交后端选择。
- `backendId` 是扩展内部元数据，发送 API 请求前会移除。

## 独立启用状态

`backendEnabledMap` 不属于 `backends.json`，只保存用户明确覆盖过的后端状态：

```json
{
    "backendEnabledMap": {
        "beta": true
    }
}
```

没有 map 项的后端跟随 JSON 内的 `enabled`，省略 `enabled` 时默认启用。配置更新会清理已删除 ID 的 map 项，并保留仍存在 ID 的显式状态。设置页选择“默认”会删除该 ID 的 map 项，恢复跟随 JSON 默认值。

根目录 `backends.json` 包含主后端和默认关闭的 Beta 后端；不包含本地测试后端。`backends.test.json` 仅包含本地测试后端，测试地址直接由其 `api_url` 定义。

设置页的“后端”区域中，JSON 配置和订阅设置属于用户选项；缓存、同步错误、最后同步时间和最后提交后端记忆属于其他本地数据。
