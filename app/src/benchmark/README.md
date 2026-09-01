# 对标企业情报（实验模块） · 删除清单

本功能整块自成一模块，与主应用**无数据耦合、无 Rust 改动**。若要一键移除、回到之前版本：

## 删除步骤
1. 删除整个文件夹 `app/src/benchmark/`。
2. 在 `app/src/App.tsx` 中删除所有带 `// [对标情报]` 标记的行：
   - `import { BENCHMARK_LABEL, BenchmarkView } from "./benchmark";`（及 `Suspense` 若仅此处使用）
   - `View` 类型里的 `| "benchmark"`
   - 导航项 `{navItem("benchmark", BENCHMARK_LABEL)}`
   - 路由分支 `{... view === "benchmark" && <Suspense>...<BenchmarkView/></Suspense>}`
3. （可选）清掉本地数据：删除桌面 `app_data_dir/kv/dw.benchmark.v1.json`（或浏览器 localStorage 的 `dw.benchmark.v1`）。**不影响**在办分析 / 报告库 / 六维评价等其它数据。

删完 `npm run typecheck && npm run build` 通过即回到原状。

## 隔离要点
- 数据独立命名空间 `dw.benchmark.v1`（kv/JSON），不碰 `dw.runs` / `dw.reports`。
- 视图懒加载，不进此页不执行本模块代码。
- 复用只读依赖：`llm/search`(检索)、`llm/adapters`、`config/store`、`data/persist`、`sources/browser`——均未修改。
