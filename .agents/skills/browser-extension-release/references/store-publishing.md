# 浏览器商店提交与验证

## 当前发布入口

商店工作流是：

```text
.github/workflows/publish-stores.yml
```

它构建并校验 Chrome、Firefox、Edge 包，然后用 `wepub` 调用当前商店 API。正式发布从不可变 tag 运行：

```bash
gh workflow run publish-stores.yml --ref X.Y.Z \
  -f chrome=true -f firefox=true -f edge=true
```

若某个商店已成功，重试时把它设为 `false`。例如只重试 Edge：

```bash
gh workflow run publish-stores.yml --ref X.Y.Z \
  -f chrome=false -f firefox=false -f edge=true
```

## GitHub Environment

发布 job 使用 `browser-stores` Environment。预期配置：

Variables：

```text
CHROME_PUBLISHER_ID
EDGE_PRODUCT_ID
```

Secrets：

```text
CHROME_CLIENT_ID
CHROME_CLIENT_SECRET
CHROME_REFRESH_TOKEN
FIREFOX_API_KEY
FIREFOX_API_SECRET
EDGE_CLIENT_ID
EDGE_API_KEY
```

Chrome Item ID 和 Firefox Add-on ID 在 workflow 中有当前项目的默认值。检查名称而非值：

```bash
gh api repos/hanydd/BilibiliSponsorBlock/environments/browser-stores/variables \
  --jq '.variables[] | {name,updated_at}'
gh api repos/hanydd/BilibiliSponsorBlock/environments/browser-stores/secrets \
  --jq '.secrets[] | {name,updated_at}'
```

### Chrome 凭据

- `CHROME_PUBLISHER_ID`：Chrome Web Store Developer Dashboard 的 `Publisher > Settings`。
- `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`：Google Cloud 中启用 Chrome Web Store API 后创建的 Web application OAuth client。
- Authorized redirect URI 必须精确为 `https://developers.google.com/oauthplayground`，放在 redirect URIs 而不是 JavaScript origins，且末尾没有 `/`。
- OAuth Playground 使用 scope `https://www.googleapis.com/auth/chromewebstore` 和 offline access，保存响应中的 `refresh_token`，不是一小时过期的 `access_token`。
- OAuth 应用应为 `In production`。不需要为管理自己的 Chrome 扩展申请 Google 验证。Testing 状态签发的 refresh token 通常 7 天过期；切换正式版后重新完整授权并替换 `CHROME_REFRESH_TOKEN`。
- `redirect_uri_mismatch` 表示 redirect URI 或 Client ID 不匹配。`403 access_denied` 且提示 testing 表示登录账号不在 Test users，或应用仍未切换正式版。

官方说明：

- https://developer.chrome.com/docs/webstore/using-api
- https://developer.chrome.com/docs/webstore/api#client-verification

### Firefox 凭据

在 `https://addons.mozilla.org/developers/addon/api/key/` 获取：

- JWT issuer -> `FIREFOX_API_KEY`
- JWT secret -> `FIREFOX_API_SECRET`

workflow 以 `listed` 渠道创建版本，并上传可构建源码归档。不要把 `unlisted` 签名误当商店更新。

### Edge 凭据

Partner Center 的 `Microsoft Edge > Publish API` 使用 v1.1 新体验：

- Client ID -> `EDGE_CLIENT_ID`
- API key -> `EDGE_API_KEY`
- Extension overview 的 Product ID -> `EDGE_PRODUCT_ID`

`EDGE_PRODUCT_ID` 必须是 Partner Center GUID，例如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`。不要填 32 位 Chromium Extension ID；填错时上传端点通常返回 404。API key 有过期日期，需要轮换。

官方说明：https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api

## 运行与日志检查

触发后记录 run ID 并等待：

```bash
gh run list --workflow publish-stores.yml --limit 3
gh run watch RUN_ID --exit-status
```

即使总 workflow 失败，也要分别检查 jobs，因为其他商店可能已经成功：

```bash
gh api repos/hanydd/BilibiliSponsorBlock/actions/runs/RUN_ID/jobs \
  --jq '.jobs[] | {id,name,status,conclusion}'
gh run view RUN_ID --job JOB_ID --log
```

只展示与结论有关的日志。GitHub 会遮罩 Secrets，但 Variables 会明文显示，因此 Variables 不得存放敏感值。

## 成功判据

### Chrome

日志应依次出现：

```text
the access token fetched
the package archive uploaded, upload_state="SUCCEEDED"
the draft submitted, item_state="PENDING_REVIEW"
```

`PENDING_REVIEW` 表示已提交审核，不是已上线。公开商店仍显示旧版本属于正常现象。不要用相同版本重复上传来测试新 refresh token。

### Firefox

日志应出现 new version created 和 source archive uploaded。可用公开 API 验证：

```text
https://addons.mozilla.org/api/v5/addons/addon/bilisponsorblock/
```

`current_version` 为目标版本且 `status` 为 `public` 才能报告公开上线。

### Edge

日志应出现 package archive uploaded、upload processed、draft submitted、submission processed。最后一项表示已交给 Edge 认证流程，不代表商店已公开。

## 常见失败与停止条件

- 缺少变量/Secret：停止在凭据检查，不调用商店；让用户在 GitHub Environment 中补齐。
- Chrome 401/invalid_grant：refresh token 无效、过期或与 Client 不匹配。重新授权并只替换 refresh token。
- Chrome 已有相同版本或正在审核：不要重复发布；查询后台状态。
- Firefox version already exists：不要删除已创建版本；确认第一次提交是否已成功。
- Edge 404：先检查 Product ID 是否为 Partner Center GUID。
- Edge 401/403：检查 Publish API v1.1 Client ID、API key 与过期日期。
- 任何商店已成功、另一个失败：仅重跑失败商店。连续失败时读取一次完整 job 日志，根据 HTTP 状态修复；不要盲目反复提交。

最终报告必须分别列出三家状态，并附 Actions run 链接。审核中的商店说明需等待，不承诺审核时间。
