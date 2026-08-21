# 多后端配置

扩展的默认多后端配置位于仓库根目录的 `backends.json`。运行时可以从本地编辑器或订阅 URL 加载同样格式的 JSON。配置文档只描述后端定义；每个后端的启用状态保存在浏览器本地的独立 `enabled map` 中，不会写回 JSON。编译配置中的 `backendSubscriptionUrl` 是默认订阅地址，`backendTestSubscriptionUrl` 是测试订阅地址；二者只用于预填设置，不要求订阅文件在本地存在。

## 顶层结构

```json
{
    "backends": [
        {
            "id": "main",
            "name": "小电视空降助手",
            "desc": "BilibiliSponsorBlock 默认后端",
            "api_url": "https://www.bsbsb.top",
            "enabled": true,
            "capabilities": [
                "/api/skipSegments",
                "/api/voteOnSponsorTime",
                "/api/viewedVideoSponsorTime",
                "/api/lockCategories",
                "/api/videoLabels",
                "/api/portVideo",
                "/api/votePort",
                "/api/updatePortedSegments",
                "/api/chapterNames",
                "/api/userInfo",
                "/api/setUsername",
                "/api/getUsername",
                "/api/warnUser"
            ]
        }
    ]
}
```

`backends` 必须是数组，可以为空。数组顺序就是匹配优先级：越靠前的后端优先级越高。后端 ID 必须唯一，并且只能包含小写 ASCII 字母、下划线和短横线。

## 后端字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 后端唯一标识，只能使用 `[a-z_-]`。 |
| `name` | string | 是 | 设置面板中显示的名称。 |
| `desc` | string | 否 | 后端介绍。 |
| `api_url` | string | 是 | API 根地址，必须为 `http` 或 `https` URL；接口路径由扩展追加。 |
| `enabled` | boolean | 否 | 该后端的默认开关状态。省略时默认为启用；用户的独立开关覆盖此值。 |
| `capabilities` | string[] | 是 | 后端支持的 API 路径。至少应包含 `/api/skipSegments` 才能提供跳过片段。 |
| `match` | expression[] | 否 | 视频匹配规则。缺省或空数组表示匹配全部视频。 |
| `mirrors` | string[] | 否 | API 根地址镜像。主地址请求失败时，在本次请求中尝试镜像。 |
| `conflicts` | string[] | 否 | 该后端被选中后，屏蔽配置数组中位于它后面的指定 ID。 |

所有 URL 必须是 `http` 或 `https` URL。`mirrors` 和 `conflicts` 不能有重复值；`conflicts` 不能引用自身。能力值不能重复。

## 能力

`capabilities` 是扩展实际依赖的 API 家族列表，不是后端服务完整 API 的目录。当前允许的能力路径为：

```text
/api/skipSegments
/api/voteOnSponsorTime
/api/viewedVideoSponsorTime
/api/lockCategories
/api/videoLabels
/api/portVideo
/api/votePort
/api/updatePortedSegments
/api/chapterNames
/api/userInfo
/api/setUsername
/api/getUsername
/api/warnUser
```

其中 `/api/videoLabels` 和 `/api/chapterNames` 是扩展实际使用的后端扩展接口，当前 Wiki 页面未列出，但后端若要支持对应功能仍需声明它们。`/api/warnUser` 位于官方文档的管理员操作章节，但扩展实现了用户确认警告的调用，因此也属于实际能力。

扩展没有实现的官方接口，例如 `/api/segmentInfo`、`/api/lockReason`、`/api/userStats`、排行榜、服务器状态和其他管理员操作，不应加入 capabilities。

后端只有声明对应能力时，依赖该 API 的功能才会把它作为候选后端。能力按 API 家族归一化，不区分 HTTP 方法或参数：GET 查询和 POST 提交共用同一个能力；哈希变体也共用根路径能力，例如 `/api/portVideo/:sha256HashPrefix` 使用 `/api/portVideo`。`/api/skipSegments` 是 BVID 片段查询和提交能力；读取片段时所有匹配、启用且声明该能力的后端都可以参与，结果随后合并。

## 匹配规则

`match` 是表达式数组，数组元素之间隐式执行 `and`。每个叶子表达式必须包含一个 `field`，以及 `exact` 或 `regexp` 之一：

```json
{
    "match": [
        { "field": "title", "exact": ["示例视频", "另一个标题"] },
        { "field": "up_mid", "regexp": "^123" }
    ]
}
```

支持的字段：

| 字段 | 运行时类型 | 来源含义 |
| --- | --- | --- |
| `title` | string | 视频标题 |
| `description` | string | 视频简介 |
| `up_mid` | string | UP 主 MID；即使 B 站原始值是 bigint，也按字符串匹配 |
| `up_name` | string | UP 主名字 |

`exact` 是完全相等匹配，值必须是字符串数组；数组中任意一个值相等即命中。`regexp` 是 JavaScript 正则表达式字符串。

逻辑表达式可以嵌套：

```json
{
    "match": [
        {
            "or": [
                { "field": "up_name", "exact": ["作者甲"] },
                {
                    "and": [
                        { "field": "title", "regexp": "教程$" },
                        { "not": { "field": "description", "exact": ["不使用空降"] } }
                    ]
                }
            ]
        }
    ]
}
```

逻辑空数组遵循布尔逻辑：`and: []` 为真，`or: []` 为假。非法正则、未知字段或混合多个操作符的表达式会使整个配置校验失败。

## 优先级与冲突

匹配器按 `backends` 顺序从上到下扫描。禁用、未匹配或已被冲突屏蔽的后端不会参与本次视频匹配。选中某个后端后，它的 `conflicts` 中列出的后端 ID 会被临时屏蔽，但只影响位于当前后端后面的项目；后项的冲突声明不会反过来取消已经选中的前项。

冲突只对当前视频、当前匹配过程生效，不修改 JSON，也不永久关闭后端。

## 合并片段

多个 `/api/skipSegments` 结果会在同一视频上合并：

- 相同 `UUID` 只保留优先级最高的条目。
- 同一个 `cid` 上时间区间重叠时，只保留优先级最高的条目。
- 不重叠的条目全部保留。
- 返回给扩展内部的条目带有 `backendId`，用于投票、统计或提交时定位来源后端。
- `backendId` 是内部元数据，不属于 SponsorBlock API 的片段 JSON；发送请求前必须移除。

合并函数接收按优先级排列的结果。若结果提供显式 `priority`，较小数字优先；否则使用结果数组下标。

## 运行时 enabled map

后端定义与运行时开关分离保存。例如，下面只表示用户明确覆盖了 `testing`；没有 `main` 项，因此 `main` 跟随 JSON 内的 `enabled`：

```json
{
    "backendEnabledMap": {
        "testing": true
    }
}
```

`backendEnabledMap` 不是 `backends.json` 的一部分。它只保存用户明确设置过的 `id -> enabled`，不会改变 JSON，也不会关闭订阅更新。新 ID 没有 map 项时跟随该后端的 `enabled`，省略 `enabled` 时默认启用；配置更新会清理已经删除的 ID。设置面板中的“默认”选项会删除对应 map 项，使开关重新跟随 JSON。匹配时只有解析后的最终状态为启用的后端参与。

根目录默认文件包含主后端和一个 `enabled: false` 的 `beta` 后端；该后端对应旧的“启用 Beta 测试服务器”选项。`backends.test.json` 只包含本地 `testing` 后端，测试地址直接由其中的 `api_url` 定义，适合在测试订阅中使用。根配置不包含本地测试后端。
