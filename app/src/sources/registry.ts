// 数据源登记册：内置浏览器「从信息源获取」的目标站点，以及带专用 API 的数据源。
// 默认值仅为方便，用户可在「设置 → 数据源」改网址 / 登录方式 / 填 API Key，也可新增自定义源（#3 框架）。
export type SourceKind = "browser" | "api" | "both";   // browser=登录站内取研报；api=有专用数据接口；both=两者皆可

export interface DataSource {
  id: string;
  name: string;                 // 报告查一查 / 企查查 / 荣大二郎神 / 巨潮资讯
  url: string;                  // 内置浏览器打开的地址（登录/首页）；可被用户覆盖
  domains: string[];            // 归属域名（远程抓取 IPC 允许名单 & 归类用）
  login: string;                // 登录方式说明（仅提示；登录在站点原生页完成，凭据只留在本机）
  kind: SourceKind;
  apiBase?: string;             // 专用数据源 API 基址（如企查查开放平台）
  apiHint?: string;             // Key 申请 / 用法提示
}

// 说明：以下网址 / 登录方式为默认建议，若与实际不符，请在「设置 → 数据源」直接修改。
export const DATA_SOURCES: DataSource[] = [
  {
    id: "baogaocha",
    name: "报告查一查",
    url: "https://www.seedhangyan.com/",
    domains: ["seedhangyan.com"],
    login: "微信扫码 / 手机号 + 密码",
    kind: "browser",
  },
  {
    id: "rongda",
    name: "荣大二郎神",
    url: "https://doc.rongdasoft.com/doc",
    domains: ["rongdasoft.com"],
    login: "手机号 + 密码",
    kind: "browser",
  },
  {
    id: "qcc",
    name: "企查查",
    url: "https://www.qcc.com/",
    domains: ["qcc.com"],
    login: "手机号 + 密码 / 微信扫码",
    kind: "both",
    apiBase: "https://api.qichacha.com",
    apiHint: "企查查开放平台申请 Key（企业工商 / 股权 / 司法等结构化数据）",
  },
  {
    id: "cninfo",
    name: "巨潮资讯",
    url: "http://www.cninfo.com.cn/new/index",
    domains: ["cninfo.com.cn"],
    login: "免登录（上市公司公开披露）",
    kind: "browser",
  },
];

export function sourceById(id: string): DataSource | undefined {
  return DATA_SOURCES.find((s) => s.id === id);
}

// 合并后的有效源：内置登记册叠加用户覆盖（网址 / API），再加用户自定义源。供「从信息源获取」与设置共用。
export interface EffectiveSource extends DataSource { enabled: boolean; apiKey?: string; custom: boolean; }
export function effectiveSources(cfgs: { id: string; name?: string; url?: string; apiKey?: string; apiBase?: string; enabled: boolean }[]): EffectiveSource[] {
  return cfgs.map((c) => {
    const base = sourceById(c.id);
    if (base) {
      return { ...base, url: c.url?.trim() || base.url, apiBase: c.apiBase?.trim() || base.apiBase, apiKey: c.apiKey, enabled: c.enabled, custom: false };
    }
    // 自定义源：登记册里没有，全部字段来自配置
    return {
      id: c.id, name: c.name?.trim() || "自定义源", url: c.url?.trim() || "",
      domains: [], login: "站点原生登录", kind: (c.apiBase ? "both" : "browser") as SourceKind,
      apiBase: c.apiBase?.trim(), apiKey: c.apiKey, enabled: c.enabled, custom: true,
    };
  });
}

// 所有内置源涉及的域名（供远程窗口 IPC 允许名单参考，实际以 capabilities 为准）
export function allSourceDomains(): string[] {
  return Array.from(new Set(DATA_SOURCES.flatMap((s) => s.domains)));
}
