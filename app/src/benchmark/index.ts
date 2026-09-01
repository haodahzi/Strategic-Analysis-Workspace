// [对标情报] 对外唯一入口：App.tsx 只从这里取导航标签与懒加载视图。删除见 README.md。
import { lazy } from "react";
export const BENCHMARK_VIEW = "benchmark" as const;
export const BENCHMARK_LABEL = "◎ 对标企业情报";
export const BenchmarkView = lazy(() => import("./Benchmark"));   // 懒加载：不进这个页就不执行本模块代码
