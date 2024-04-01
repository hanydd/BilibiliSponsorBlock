如果您向B站空降助手贡献代码，代表您同意您的贡献也以GPL-3.0协议开源

# 构建项目

本插件是在 [SponsorBlock](https://github.com/ajayyy/SponsorBlock) v5.4 版本基础上开发而来，从 SponsorBlock v5.5.9 版本开始不再进行功能同步，部分原项目中有价值的功能会手动添加到本项目中。

## 环境和准备
1. 安装 Node.js 16 及以上版本
1. 了解 Git，Node.js，npm 和命令行工具的基本使用方法
1. 安装主流浏览器（Chrome以及Chromium内核的浏览器、Edge、Firefox、Safari……）

## 构建

1. 下载源代码。推荐使用Git，或者图形化Git工具。

    执行下面的命令。
    ```bash
    git clone --recursive https://github.com/HanYaodong/BilibiliSponsorBlock.git
    ```
    完成后执行下面的命令更新 submodule。
    ```bash
    git submodule update --init --recursive
    ```

1. 复制文件 `config.json.example`，并重命名为 `config.json`。你也可以根据需要，调整里面的选项。
    - JSON文件中不允许注释，请确保删除所有的注释。
    - 如果在构建过程中，你遇到了 `CompileConfig` 或者 `property does not exist on type ConfigClass` 相关的报错，你需要删除你的 `config.json` 并从 `config.json.example` 重新复制一份新的文件。项目修改 `config.json` 可能导致此类报错。

1. 在项目目录下执行 `npm ci` 安装依赖。你可能需要安装 C 语言构建工具才能完成安装。

1. 在项目目录下执行 `npm run build:dev` (Chrome) 或 `npm run build:dev:firefox` (Firefox)，打包开发版插件。

    你也可以执行 `npm run build` 或者 `npm run build:firefox` 打包发行版插件，

1. 打包好的程序会输出在 `dist/` 文件夹下，你可以直接把生成的文件直接[加载到Chrome浏览器中](https://developer.chrome.com/docs/extensions/mv3/getstarted/#manifest)或者[压缩后加载到火狐浏览器中](https://developer.mozilla.org/docs/Tools/about:debugging#loading_a_temporary_extension)。

## 开发和测试

执行 `npm run dev` (Chrome) 或者 `npm run dev:firefox` (火狐)，npm 会打开一个安装好测试版插件的浏览器窗口，并且支持代码修改热加载。这里使用了[`web-ext run`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#commands)。

使用上面的方法，插件有可能在初次打开的时候不正常加载。如果你发现有问题，可以打开浏览器的插件管理，并手动重新加载插件。

