<p align="center">
  <a href="https://www.bsbsb.top"><img src="public/icons/LogoSponsorBlocker256px.png" alt="Logo"></img></a>

  <br/>
  <sub>Logo by <a href="https://github.com/munadikieh">@munadikieh</a>. Modified by Yaodong</sub>
</p>

<h1 align="center">B站空降助手</h1>

<div align="center">

[![LICENSE](https://img.shields.io/github/license/hanydd/BilibiliSponsorBlock)](LICENSE)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/eaoelafamejbnggahofapllmfhlhajdd?label=Chrome%20%E6%8F%92%E4%BB%B6%E5%95%86%E5%BA%97)](https://chrome.google.com/webstore/detail/eaoelafamejbnggahofapllmfhlhajdd)
[![用户数量](https://img.shields.io/badge/dynamic/json?url=http%3A%2F%2F47.103.74.95%2Fapi%2FgetTotalStats&query=activeUsers&suffix=人&label=用户&color=green&cacheSeconds=3600)](https://www.bsbsb.top/stats/)
[![片段数量](https://img.shields.io/badge/dynamic/json?url=http%3A%2F%2F47.103.74.95%2Fapi%2FgetTotalStats&query=totalSubmissions&label=共提交了&suffix=个片段&color=red&cacheSeconds=3600)](https://www.bsbsb.top/stats/)
[![节省时间](https://img.shields.io/badge/dynamic/json?url=http%3A%2F%2F47.103.74.95%2Fapi%2FgetTotalStats&query=minutesSaved&suffix=%E5%88%86%E9%92%9F&label=%E5%85%B1%E8%8A%82%E7%9C%81&color=orange&cacheSeconds=3600)](https://www.bsbsb.top/stats/)
[![CI Status](https://img.shields.io/github/actions/workflow/status/hanydd/BilibiliSponsorBlock/ci.yml)](https://github.com/hanydd/BilibiliSponsorBlock/actions/workflows/ci.yml)

</div>

<p align="center">
  <b>安装</b>：
  <a href="https://chromewebstore.google.com/detail/eaoelafamejbnggahofapllmfhlhajdd">Chrome</a>｜
  <a href="https://microsoftedge.microsoft.com/addons/detail/khkeolgobhdoloioehjgfpobjnmagfha">Edge</a>｜
  <a href="https://addons.mozilla.org/firefox/addon/bilisponsorblock/">FireFox</a>
</p>

<p align="center">
  <span>交流群：371384235 ｜ 网站：<a href="https://www.bsbsb.top">bsbsb.top</a></span>
</p>

受够了 B 站视频中无处不在的赞助广告了吗？受够了看了一半才发现的软广视频了吗？B 站空降助手是一款帮你精准空降到广告之后的浏览器插件。插件自动获取并跳过广告片段，让你的视频体验毫无中断！

除了广告之外，插件还支持跳过其他类别的片段，例如开场结尾的动画、一键三连提示，或者直接空降到视频封面的位置。插件中所有的标注片段都来自网友标注，您也可以提交自己的片段来为空降指挥部添砖加瓦。

想知道大佬们提交了多少片段？在[排行榜](https://www.bsbsb.top/stats/)看看吧。

目前本项目由我个人在业余时间维护，如果你想支持我，欢迎查看[赞助](https://www.bsbsb.top/donate/)。

本插件移植自油管插件[SponsorBlock](https://github.com/ajayyy/SponsorBlock)，保留了大部分的 UI 和使用方法，加入一些了 B 站特色的功能。

# 安装

-   目前上架了[Chrome 应用商店](https://chromewebstore.google.com/detail/eaoelafamejbnggahofapllmfhlhajdd)，[Edge 应用商店](https://microsoftedge.microsoft.com/addons/detail/khkeolgobhdoloioehjgfpobjnmagfha)， [火狐应用商店](https://addons.mozilla.org/en-US/firefox/addon/bilisponsorblock/)。如果你知道更多流行的浏览器插件商店，欢迎留言~

-   或者可以从 [Github Release](https://github.com/hanydd/BilibiliSponsorBlock/releases/latest) 页面获取最新发布的插件。

    1. 根据您浏览器的类型下载适合的版本，Chrome、Edge、360 和基于 Chromium 的国产浏览器下载 `ChromiumExtension.zip`；火狐浏览器下载`FirefoxExtension.zip`。并解压缩。

    1. 打开浏览器的插件管理页面，启用“开发者模式”，点击`加载已解压的拓展程序`，选择刚刚下载解压的插件文件夹，就可以完成安装。

# 功能

## 使用说明

如果你使用过 YouTube 的原插件，你会发现在核心功能和交互上，本插件基本没有做出大的改动。可以先参照原插件的使用方法尝试使用。

可以先在这个[示例视频](https://www.bilibili.com/video/BV1Km42177kz/)上试一试精准空降的快乐！

视频使用说明正在计划制作中。

## 相比[原插件](https://github.com/ajayyy/SponsorBlock)变化

-   放弃了多语言支持，只支持简体和繁体中文。

-   放弃了移动端网页支持。根据我个人搬运视频的播放数据，移动端网页只占播放量的 0.5%。如果有机会，日后可以做一个安卓端 ReVanced 插件。

-   放弃了第三方镜像站支持。如果有使用人数多的镜像站，欢迎讨论添加支持。

-   加入了绑定搬运视频的功能。绑定的油管视频可以自动从 SponsorBlock 数据库中获取片段信息。

-   更新 UI。

## 功能更新计划（按优先级排序）

-   制作功能介绍视频

-   支持分 P 视频标注（目前所有分 P 都会被当作同一段视频，导致提交的片段互相覆盖）

-   完善 API 接口文档

-   通过空降弹幕自动获取片段 “空降 xx:xx”、“猝不及防”等 [#3](https://github.com/hanydd/BilibiliSponsorBlock/issues/3)

-   评论和动态标记

-   支持悬浮预览 / 小窗播放器 / 嵌入式播放器

-   欢迎大家提出意见和建议！

# 服务端

服务端代码：https://github.com/hanydd/BilibiliSponsorBlockServer

# API

本项目对 API 改动不大，可以先参考[原项目文档](https://wiki.sponsor.ajay.app/w/API_Docs)。

# 搭建项目

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

# 致谢

感谢[ajayyy](https://github.com/ajayyy)创造的[SponsorBlock](https://github.com/ajayyy/SponsorBlock)给我的启发！

### 开源协议

本项目遵循 GNU GPL v3 开源协议。
