# 发布浏览器扩展

仓库的 `Publish extension stores` GitHub Actions 工作流可以一次构建、测试并提交 Chrome、Firefox 和 Edge 商店。工作流只支持更新已有商店项目，不创建新的商店条目。

## 首次配置

在 GitHub 仓库的 `Settings > Environments` 中创建 `browser-stores` 环境。把下面的普通标识保存为 environment variables：

| Variable | 用途 |
| --- | --- |
| `CHROME_PUBLISHER_ID` | Chrome Web Store 的 Publisher ID |
| `CHROME_ITEM_ID` | Chrome 扩展 ID；未配置时使用当前扩展的 `eaoelafamejbnggahofapllmfhlhajdd` |
| `FIREFOX_ADDON_ID` | AMO Add-on ID；未配置时使用当前扩展的 `{f10c197e-c2a4-43b6-a982-7e186f7c63d9}` |
| `EDGE_PRODUCT_ID` | Partner Center 中的 Edge Product ID |

把凭据保存为 environment secrets：

| Secret | 获取位置 |
| --- | --- |
| `CHROME_CLIENT_ID` | Google Cloud OAuth client |
| `CHROME_CLIENT_SECRET` | Google Cloud OAuth client |
| `CHROME_REFRESH_TOKEN` | 使用 Chrome Web Store scope 生成的 OAuth refresh token |
| `FIREFOX_API_KEY` | AMO API Credentials 页面中的 JWT issuer |
| `FIREFOX_API_SECRET` | AMO API Credentials 页面中的 JWT secret |
| `EDGE_CLIENT_ID` | Partner Center 的 Publish API 页面 |
| `EDGE_API_KEY` | Partner Center 的 Publish API 页面 |

凭据创建说明：

- [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)
- [Firefox Add-ons API credentials](https://addons.mozilla.org/developers/addon/api/key/)
- [Microsoft Edge Add-ons API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api)

不要把凭据写进仓库文件、Issue、Actions 日志或聊天记录。

## 发布

1. 修改 `manifest/manifest.json` 中的版本号并提交。商店不接受重复或降低的版本号。
2. 确认准备发布的 commit 已推送到 GitHub。
3. 打开仓库的 `Actions > Publish extension stores > Run workflow`。
4. 选择要发布的 branch 或 tag。三个商店默认全部选中，也可以暂时关闭其中一个。
5. 点击 `Run workflow`。

工作流先运行 lint、测试和三种构建，并确认三个 ZIP 中的版本号一致。通过后，三个商店提交任务并行运行：

- Chrome 上传后提交审核，审核通过后自动发布。
- Firefox 以 `listed` 渠道提交，并附带构建所对应的源码归档。
- Edge 上传后提交认证，并附带版本、commit 和最新提交说明。

工作流会保留构建包 14 天。商店审核结果和实际上线时间仍由各商店决定。
