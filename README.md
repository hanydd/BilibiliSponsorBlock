<p align="center">
  <a href="https://sponsor.ajay.app"><img src="public/icons/LogoSponsorBlocker256px.png" alt="Logo"></img></a>

  <br/>
  <sub>Logo by <a href="https://github.com/munadikieh">@munadikieh</a>. Modified by Yaodong</sub>
</p>

<h1 align="center">B站空降助手</h1>

受够了B站视频中无处不在的恰饭广告了吗？受够了看了一半才发现的软广视频了吗？B站空降助手是一款帮你精准空降到广告之后的浏览器插件。插件自动获取并跳过广告片段，让你的视频体验毫无中断！

除了广告之外，插件还支持跳过其他类别的片段，例如开场结尾的动画、一键三连提示，或者直接空降到视频封面的位置。插件中所有的标注片段都来自网友标注，您也可以提交自己的片段来为空降指挥部添砖加瓦。

本插件移植自油管插件[SponsorBlock](https://github.com/ajayyy/SponsorBlock)，保留了大部分的UI和使用方法，加入一些了B站特色的功能。

目前本项目还处于开发中（包括本文档）。

# 安装

目前可以从 [Github Release](https://github.com/HanYaodong/BilibiliSponsorBlock/releases/latest) 页面获取最新发布的插件。

1. 根据您浏览器的类型下载适合的版本，Chrome、Edge、360和基于Chromium的国产浏览器下载 `ChromiumExtension.zip`；火狐浏览器下载`FirefoxExtension.zip`。

1. 将下载好的压缩包**直接**拖进浏览器里，这时会弹窗提示是否安装插件，点击“是”完成安装。


插件商店正在上架中！目前计划上架Chrome、Edge和Firefox应用商店，如果你知道更多流行的插件分发平台，欢迎在 [Issue](https://github.com/HanYaodong/BilibiliSponsorBlock/issues/new) 里留言!

# 功能

## 使用说明

计划做个视频使用说明。

可以先在这个[示例视频](https://www.bilibili.com/video/BV1Km42177kz/)上试一试精准空降的快乐！

## 相比[原插件](https://github.com/ajayyy/SponsorBlock)变化

如果你使用过YouTube的原插件，你会发现在核心功能和交互上，本插件基本没有做出大的改动。功能主要的不同有以下几点：

- 放弃了多语言支持。不会真的有人看不懂中文还在刷B站吧？

- 放弃了移动端网页支持。根据我个人搬运视频的播放数据，移动端网页只占播放量的0.5%。如果有机会，日后可以做一个安卓端 ReVanced 插件。

- 放弃了第三方镜像站支持。我不清楚B站有没有镜像站，如果大家知道有使用人数多的欢迎提Issue。

- 加入动态标记功能（制作中）。恰饭动态真的好多，甚至比视频更得还快。

- 加入评论标记功能（制作中）。不用多说了，百亿红包，点击就领！评论区置顶链接yyds！


## 功能更新计划

- 评论和动态标记

- 搬运视频自动获取油管标注

- 完善文档

- 欢迎大家提出意见和建议！

# 服务端

服务端代码（同样也在开发中）：https://github.com/HanYaodong/SponsorBlockServer

# API

油管原项目的[API](https://wiki.sponsor.ajay.app/w/API_Docs)，本项目对API改动很小，可以先参考原项目文档。

# 搭建项目
详见 [CONTRIBUTING.md](CONTRIBUTING.md)

# 致谢

感谢[ajayyy](https://github.com/ajayyy)创造的[SponsorBlock](https://github.com/ajayyy/SponsorBlock)给我的启发！

### 开源协议

本项目在遵循 GNU GPL v3 开源协议。
