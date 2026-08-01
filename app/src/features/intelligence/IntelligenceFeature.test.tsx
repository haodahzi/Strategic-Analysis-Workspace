import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceFeature } from "./IntelligenceFeature";

describe("IntelligenceFeature", () => {
  it("shows the initializing shell", () => {
    const html = renderToStaticMarkup(
      <IntelligenceFeature status="initializing" onRetry={vi.fn()} />,
    );

    expect(html).toContain("对标企业情报");
    expect(html).toContain("正在检查本地数据");
  });

  it("shows a retryable error", () => {
    const html = renderToStaticMarkup(
      <IntelligenceFeature status="error" onRetry={vi.fn()} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("重试");
  });
});
