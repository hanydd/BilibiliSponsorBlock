## General

This is a Chromium browser extension (BilibiliSponsorBlock / 小电视空降助手) that skips sponsor segments on Bilibili videos. It is a single-product npm repo (not a monorepo). This project builds with npm.

## 本地前后端联调

- 后端工作树：`/home/hanyd/.t3/worktrees/SponsorBlockServer/t3code-daily-skip-collection`，本地地址：`http://127.0.0.1:9876`。
- 用户要求使用 `npm run start` 启动，不使用 `dev` / watch。每轮修改后端后必须重启，再验证接口。
- 现有重启入口：在后端工作树运行 `python3 working/contributions/restart.py`；它使用 `npm run start`，日志为 `working/contributions/local.log`。
- 当前调试后端连接 Windows PostgreSQL 的 `sponsorTimes` 恢复库，连接信息来自 `C:\Users\hanya\project\extension\SponsorBlockServer\config.json`（本地 ignored 配置已复制认证，WSL 通过 Windows 网关访问）。不要改回 Docker `55440/contributions` 演示库，也不要向恢复库运行演示数据 seed。
