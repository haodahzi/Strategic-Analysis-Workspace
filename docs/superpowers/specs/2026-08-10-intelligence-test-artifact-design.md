# 对标企业情报独立测试安装包设计

日期：2026-08-10

## 目标

在不合并或修改主分支的前提下，将 `feature/competitive-intelligence` 分支构建为可下载、可与正式版共存的 Windows 测试安装包，供手工验收对标企业情报功能。

## 分支与触发

- 工作流只响应 `feature/competitive-intelligence` 分支的推送。
- 构建失败时可在同一次 GitHub Actions 运行记录中重跑。
- 不创建 Pull Request、Git Tag 或 GitHub Release。
- 不向 `claude/business-project-docking-workbench-ccies1` 或其他分支写入内容。

## 测试版隔离

构建时叠加专用 Tauri 配置：

- 产品名：`StrategicAnalysisWorkbench-IntelligenceTest`
- 应用标识：`com.zhanlue.workbench.intelligence-test`
- Credential Manager 服务名：`com.zhanlue.workbench.intelligence-test.llm`
- 安装包类型：Windows NSIS `setup.exe`

独立应用标识使测试版拥有独立的应用数据目录和 SQLite 情报库；工作流通过编译期环境变量注入独立凭据服务名，使测试版不会读取或覆盖正式版模型 Key。测试配置只影响打包产物，不改变正式版 `tauri.conf.json`。

## 构建门禁

GitHub Actions 使用 Node.js 20 和 Rust 1.77.2，依次执行：

1. `npm ci`
2. `npm test`
3. `npm run typecheck`
4. `cargo test --locked`
5. `cargo check --locked`
6. `cargo fmt -- --check`
7. 设置测试版凭据服务名后执行 `npm run tauri build -- --config src-tauri/tauri.intelligence-test.conf.json`

任一步失败，工作流失败且不上传安装包。

## 下载交付

- 使用 GitHub Actions Artifact 上传 `app/src-tauri/target/release/bundle/nsis/*-setup.exe`。
- Artifact 名称包含 `competitive-intelligence-windows-test` 和提交短 SHA，避免不同构建相互混淆。
- Artifact 保留 30 天。
- 用户从 GitHub 仓库的 Actions 页面进入对应运行记录，下载 ZIP、解压并运行 `setup.exe`。

## 安全与错误处理

- 工作流权限保持只读，不授予 Release 写权限。
- 不上传源码之外的本机配置、数据库或凭据。
- 测试包不签名；Windows SmartScreen 可能提示未知发布者，测试者需核对仓库与提交 SHA 后决定是否运行。
- GitHub 构建失败时保留日志，不创建不完整 Artifact。

## 验收标准

- 工作流只在指定功能分支运行。
- 测试配置的产品名和应用标识与正式版不同。
- 测试构建使用独立 Credential Manager 服务名，正式构建仍使用原服务名。
- 本地配置校验、前后端测试及生产构建通过。
- 功能分支推送成功后，GitHub Actions 构建成功并出现可下载的 NSIS Artifact。
- 安装测试版后，正式版数据目录和功能不受影响。
