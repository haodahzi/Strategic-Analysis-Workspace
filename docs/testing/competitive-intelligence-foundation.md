# 对标企业情报基础设施验收协议

验收日期：2026-08-10

功能分支：`feature/competitive-intelligence`

目标基线：`origin/claude/business-project-docking-workbench-ccies1`

## 范围

本协议验收对标企业情报模块的基础设施：独立导航入口、独立 SQLite 数据库、安全 HTTPS 抓取与不可变快照、启动恢复、TypeScript 平台边界，以及模型密钥的安全存储。首期明确不包含招聘岗位、招聘趋势、招聘采集器或招聘分析。

## 自动化门禁

在 `app` 目录执行：

```powershell
npm ci
npm test
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
rg -n "招聘|岗位|recruitment" src src-tauri
```

Rust 验收固定使用项目要求的 Rust/Cargo 1.77.2；Cargo.lock 必须纳入版本控制。搜索结果需逐项复核，已有模块中的历史文本不应机械删除，新情报模块不得出现招聘功能。

## 手工验收

- [x] 现有“总览”“新建分析”“报告库”和“设置”均可正常打开。
- [x] “对标企业情报”入口可打开，且不会修改现有分析项目或报告。
- [x] 桌面端首次打开情报模块后，在 Tauri 应用数据目录创建 `intelligence/competitive-intelligence.db`；数据库不位于 WebView/localStorage。
- [ ] 插入一条 `status = 'running'` 的合成采集记录后关闭应用；下次启动将其标为 `interrupted`，错误码为 `APP_EXIT`，且只准备补采窗口、不自动开始采集。
- [x] HTTP、localhost、`127.0.0.1`、`169.254.169.254`、私网/链路本地地址以及与已配置 host 不匹配的目标均被拒绝。
- [ ] 公网 HTTPS 固定夹具仅保存一份 gzip 快照；重复内容得到相同哈希/路径；IPC 只返回元数据而不返回正文。
- [ ] 桌面端旧版模型 Key 成功写入 Windows Credential Manager 后，`dw.config.v1` 中不再存在任何 `apiKey` 属性或密钥值。
- [x] 浏览器端旧版模型 Key 只进入当前会话内存，并立即从 `dw.config.v1` 脱敏；刷新后不保留 Key，且不调用任何 Tauri 命令。
- [x] 设置页编辑 Key、Base URL、模型和任务路由时不自动保存；点击“保存设置”后等待完成，失败时保留草稿并只显示安全错误。
- [x] UI、数据库表、采集器、文案和测试中均无招聘岗位或招聘趋势功能。

## 安全检查

- HTTPS 客户端禁用重定向、代理和自动解压，使用 DNS 固定结果、20 秒超时和 5 MiB 流式上限。
- 快照按 SHA-256 内容哈希不可变保存为 gzip，IPC 不回传正文。
- Credential Manager service 固定为 `com.zhanlue.workbench.llm`；provider ID 仅允许 ASCII 字母、数字和连字符。
- 密钥不写入 SQLite、localStorage、快照、日志或备份；公开错误不包含平台异常或密钥值。
- Tauri capability 文件保持与批准基线一致。

## 验收记录

若任一门禁失败，先添加失败回归测试并修复，再重新执行完整门禁。

### 2026-08-10 最终执行记录

| 门禁 | 结果 | 记录 |
| --- | --- | --- |
| `npm ci` | 通过 | 安装 154 个包；依赖审计报告 7 个既有/传递漏洞，本计划未执行破坏性 `audit fix --force`。 |
| 最终前端完整测试 | 通过 | 18 个文件，162/162，退出码 0。 |
| 凭据迁移、脱敏与失败重试聚焦测试 | 通过 | `secureConfig.test.ts` 15/15，`bootstrap.test.tsx` 9/9。 |
| TypeScript 类型检查 | 通过 | `npm run typecheck` 退出码 0。 |
| Vite 生产构建 | 通过 | 87 个模块完成转换，退出码 0。 |
| Rust 1.77.2 完整测试 | 通过 | `cargo test --locked`，40/40，退出码 0。 |
| Rust 1.77.2 check / fmt | 通过 | `cargo check --locked` 与 `cargo fmt -- --check` 退出码均为 0。 |
| 招聘范围排除 | 通过 | `rg -n "招聘\|岗位\|recruitment" app/src app/src-tauri` 无匹配。 |
| API Key/localStorage 静态检查 | 通过 | `rg -n "apiKey.*localStorage\|localStorage.*apiKey" app/src` 无匹配。 |
| `Cargo.lock` | 通过 | 已被 Git 跟踪。 |
| Tauri capability | 通过 | 相对批准基线差异为零。 |
| 桌面 GUI 冒烟 | 通过 | Rust 1.77.2 开发版真实窗口启动；情报页显示“本地情报库已就绪”；总览、新建分析、报告库可切换；无启动日志错误。 |
| 浏览器 GUI 冒烟 | 通过 | 首页、情报页“此功能仅在桌面版可用”和设置页“保存设置”均正常；控制台无 warning/error。 |
| SQLite 落盘位置 | 通过 | 数据库位于 `%APPDATA%/com.zhanlue.workbench/intelligence/competitive-intelligence.db`，隔离 WebView 目录内无数据库。 |
| 进程清理 | 通过 | 桌面 Tauri/WebView/Vite 与浏览器 Vite 冒烟进程树均已停止。 |

未直接向现有用户数据库插入合成运行记录，也未写入真实 Windows Credential Manager 密钥，以避免污染用户数据；对应恢复 SQL、NoEntry、迁移顺序和失败回滚均由自动化测试覆盖。公网 HTTPS 条目使用受控本地 HTTP 夹具和目标验证单元测试覆盖，不依赖外部站点稳定性。
