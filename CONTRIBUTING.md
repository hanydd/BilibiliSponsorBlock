如果您向小电视空降助手贡献代码，代表您同意您的贡献也以GPL-3.0协议开源

# 构建项目

本插件是在 [SponsorBlock](https://github.com/ajayyy/SponsorBlock) v5.4 版本基础上开发而来，从 SponsorBlock v5.5.9 版本开始不再进行功能同步，部分原项目中有价值的功能会手动添加到本项目中。

## 环境和准备
1. 安装 Node.js 20 及以上版本（建议使用 Node.js 20 LTS）
1. 了解 Git，Node.js，npm 和命令行工具的基本使用方法
1. 安装主流浏览器（Chrome以及Chromium内核的浏览器、Edge、Firefox、Safari……）

## 构建

1. 下载源代码。推荐使用Git，或者图形化Git工具。

    执行下面的命令。
    ```bash
    git clone https://github.com/hanydd/BilibiliSponsorBlock.git
    ```

1. 复制文件 `config.json.example`，并重命名为 `config.json`。你也可以根据需要，调整里面的选项。
    - JSON文件中不允许注释，请确保删除所有的注释。
    - 如果在构建过程中，遇到了 `CompileConfig` 或者 `property does not exist on type ConfigClass` 相关的报错，你需要删除 `config.json` 并从 `config.json.example` 重新复制一份新的文件。上游项目修改 `config.json` 的结构可能导致此类报错。

1. 在项目目录下执行 `npm ci` 安装依赖。可能需要安装 C 语言构建工具才能完成安装。

1. 在项目目录下执行 `npm run build:dev` (Chrome) 或 `npm run build:dev:firefox` (Firefox)，打包开发版插件。

    也可以执行 `npm run build`、`npm run build:firefox` 或 `npm run build:safari` 打包发行版插件。
    如果要生成 macOS Safari 可直接用的 Xcode 工程，执行 `npm run build:safari:macos`。

1. 打包好的程序会输出在 `dist/` 文件夹下，你可以直接把生成的文件直接[加载到Chrome浏览器中](https://developer.chrome.com/docs/extensions/mv3/getstarted/#manifest)或者[压缩后加载到火狐浏览器中](https://developer.mozilla.org/docs/Tools/about:debugging#loading_a_temporary_extension)。
   Safari 的 `npm run build:safari:macos` 会在项目根目录生成 `safari/` Xcode 工程。

## 后端配置

后端 API 地址和能力配置不放在 `config.json` 中，而是放在仓库根目录的：

- `backends.json`：默认订阅配置，包含正式后端和默认关闭的 `beta` 后端。
- `backends.test.json`：本地测试订阅配置，只包含 `http://127.0.0.1:9876` 测试后端。

`config.json` 和 `config.json.example` 只保存编译配置及默认订阅 URL。不要在其中新增后端 API 地址；需要新增或修改后端时，应同步更新对应的 `backends*.json` 文件。后端 JSON 的字段、能力列表、匹配规则、冲突规则和启用状态说明见 [`docs/backend-config.md`](docs/backend-config.md)。

后端配置文件必须保持合法 JSON，并通过配置校验。JSON 中的 `enabled` 是后端默认状态；用户在设置页选择的单项状态保存在本地 `backendEnabledMap`，不会写回 JSON。选择“默认”会清除该后端的显式覆盖，使其重新跟随 JSON 中的 `enabled`。

## 开发和测试

执行 `npm run dev` (Chrome) 或者 `npm run dev:firefox` (火狐)，npm 会打开一个安装好测试版插件的浏览器窗口，并且支持代码修改热加载。这里使用了[`web-ext run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#commands)。

Playwright 页面集成测试的安装、运行方式和 Bilibili 风控排查见 [docs/playwright-e2e.md](docs/playwright-e2e.md)。

插件有可能在初次打开的时候不正常加载。如果你发现有问题，可以打开浏览器的插件管理，并手动重新加载插件。

修改后端配置或路由代码时，建议执行：

```bash
npm run test-without-building
npm run lint
npm run build:chrome
```

如果需要测试本地后端，可以将设置页的订阅 URL 临时改为 `backends.test.json` 对应的订阅地址，并确保本地服务监听 `127.0.0.1:9876`。不要把本地测试后端加入 `backends.json`。
