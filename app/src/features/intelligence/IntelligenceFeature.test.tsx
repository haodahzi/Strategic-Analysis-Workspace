import { Children, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceFeature } from "./IntelligenceFeature";

describe("IntelligenceFeature", () => {
  it("shows the initializing shell", () => {
    const html = renderToStaticMarkup(
      <IntelligenceFeature boot={{ status: "initializing" }} onRetry={vi.fn()} />,
    );

    expect(html).toContain("对标企业情报");
    expect(html).toContain("正在检查本地数据");
  });

  it("shows a retryable error", () => {
    const html = renderToStaticMarkup(
      <IntelligenceFeature boot={{ status: "error" }} onRetry={vi.fn()} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("重试");
  });

  it("connects the error button to the supplied retry callback", () => {
    const onRetry = vi.fn();
    const tree = IntelligenceFeature({ boot: { status: "error" }, onRetry });
    const findButton = (node: unknown): ReactElement | undefined => {
      if (!isValidElement(node)) return undefined;
      if (node.type === "button") return node;
      for (const child of Children.toArray(node.props.children)) {
        const found = findButton(child);
        if (found) return found;
      }
      return undefined;
    };

    const button = findButton(tree);
    expect(button).toBeDefined();
    button?.props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
