<p align="center">
  <a href="https://sponsor.ajay.app"><img src="public/icons/LogoSponsorBlocker256px.png" alt="Logo"></img></a>

  <br/>
  <sub>Logo by <a href="https://github.com/munadikieh">@munadikieh</a>. Modified by Yaodong</sub>
</p>

<h1 align="center">B站空降助手</h1>

<div align="center">

  [![LICENSE](https://img.shields.io/github/license/HanYaodong/BilibiliSponsorBlock)](LICENSE)
  [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/eaoelafamejbnggahofapllmfhlhajdd.svg)](https://chrome.google.com/webstore/detail/eaoelafamejbnggahofapllmfhlhajdd)
  [![CI Status](https://img.shields.io/github/actions/workflow/status/HanYaodong/BilibiliSponsorBlock/ci.yml)](https://github.com/HanYaodong/BilibiliSponsorBlock/actions/workflows/ci.yml)

</div>

<p align="center">安装：
  <a href="https://chromewebstore.google.com/detail/eaoelafamejbnggahofapllmfhlhajdd">Chrome</a> |
  <a href="https://microsoftedge.microsoft.com/addons/detail/khkeolgobhdoloioehjgfpobjnmagfha">Edge</a> |
  <a href="https://addons.mozilla.org/firefox/addon/bilisponsorblock/">FireFox</a>
  &nbsp;&nbsp;交流群：371384235
</p>

受够了B站视频中无处不在的恰饭广告了吗？受够了看了一半才发现的软广视频了吗？B站空降助手是一款帮你精准空降到广告之后的浏览器插件。插件自动获取并跳过广告片段，让你的视频体验毫无中断！

除了广告之外，插件还支持跳过其他类别的片段，例如开场结尾的动画、一键三连提示，或者直接空降到视频封面的位置。插件中所有的标注片段都来自网友标注，您也可以提交自己的片段来为空降指挥部添砖加瓦。

本插件移植自油管插件[SponsorBlock](https://github.com/ajayyy/SponsorBlock)，保留了大部分的UI和使用方法，加入一些了B站特色的功能。

目前本项目还处于开发中（包括本文档）。

# 安装

- 目前上架了[Chrome应用商店](https://chromewebstore.google.com/detail/eaoelafamejbnggahofapllmfhlhajdd)，[Edge应用商店](https://microsoftedge.microsoft.com/addons/detail/khkeolgobhdoloioehjgfpobjnmagfha)， [火狐应用商店](https://addons.mozilla.org/en-US/firefox/addon/bilisponsorblock/)。如果你知道更多流行的浏览器插件商店，欢迎留言~

- 或者可以从 [Github Release](https://github.com/HanYaodong/BilibiliSponsorBlock/releases/latest) 页面获取最新发布的插件。

  1. 根据您浏览器的类型下载适合的版本，Chrome、Edge、360和基于Chromium的国产浏览器下载 `ChromiumExtension.zip`；火狐浏览器下载`FirefoxExtension.zip`。并解压缩。

  1. 打开浏览器的插件管理页面，启用“开发者模式”，点击`加载已解压的拓展程序`，选择刚刚下载解压的插件文件夹，就可以完成安装。


# 功能

## 使用说明

如果你使用过YouTube的原插件，你会发现在核心功能和交互上，本插件基本没有做出大的改动。可以先参照原插件的使用方法尝试使用。

可以先在这个[示例视频](https://www.bilibili.com/video/BV1Km42177kz/)上试一试精准空降的快乐！

视频使用说明正在计划制作中。

## 相比[原插件](https://github.com/ajayyy/SponsorBlock)变化

- 放弃了多语言支持。不会真的有人看不懂中文还在刷B站吧？

- 放弃了移动端网页支持。根据我个人搬运视频的播放数据，移动端网页只占播放量的0.5%。如果有机会，日后可以做一个安卓端 ReVanced 插件。

- 放弃了第三方镜像站支持。我不清楚B站有没有镜像站，如果大家知道有使用人数多的欢迎提Issue。

- 加入动态标记功能（计划中）。恰饭动态真的好多，甚至比视频更得还快。

- 加入评论标记功能（计划中）。不用多说了，百亿红包，点击就领！评论区置顶链接yyds！


## 功能更新计划（按优先级排序）

- 搬运视频自动获取油管标注

- 支持分P视频标注（目前所有分P都会被当作同一段视频，导致提交的片段互相覆盖）

- 评论和动态标记

- 支持悬浮预览 / 小窗播放器 / 嵌入式播放器

- 通过空降弹幕自动获取片段 “空降xx:xx”、“猝不及防”等 [#3](https://github.com/HanYaodong/BilibiliSponsorBlock/issues/3)

- 完善文档

- 欢迎大家提出意见和建议！


# 服务端

服务端代码（同样也在开发中）：https://github.com/HanYaodong/SponsorBlockServer

# API

本项目对API改动很小，可以先参考[原项目文档](https://wiki.sponsor.ajay.app/w/API_Docs)。

# 搭建项目

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

# 致谢

感谢[ajayyy](https://github.com/ajayyy)创造的[SponsorBlock](https://github.com/ajayyy/SponsorBlock)给我的启发！

### 开源协议

本项目在遵循 GNU GPL v3 开源协议。
