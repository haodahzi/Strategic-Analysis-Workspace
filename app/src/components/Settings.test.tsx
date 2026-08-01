/* @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replaceRuntimeSecrets, resetRuntimeSecretsForTests } from "../config/store";
import Settings from "./Settings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("Settings secure save", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    resetRuntimeSecretsForTests();
  });

  it("keeps every edit in draft state and awaits the explicit save", async () => {
    const pending = deferred<{ storage: "persistent-native" }>();
    const save = vi.fn(() => pending.promise);
    const { container } = render(<Settings saveSecurely={save} />);
    const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    const textInputs = container.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])');

    fireEvent.change(key, { target: { value: "draft-key" } });
    fireEvent.change(textInputs[0], { target: { value: "https://draft.example.test" } });
    fireEvent.change(textInputs[1], { target: { value: "draft-model-one, draft-model-two" } });
    const select = container.querySelector<HTMLSelectElement>("select")!;
    fireEvent.change(select, { target: { value: "openai" } });
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("已存本机");

    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].providers.find((provider) => provider.id === "claude")?.apiKey).toBe("draft-key");
    expect(save.mock.calls[0][0].providers.find((provider) => provider.id === "claude")?.models).toEqual([
      "draft-model-one",
      "draft-model-two",
    ]);
    expect(screen.queryByText("设置已安全保存")).toBeNull();
    expect((screen.getByRole("button", { name: "保存中…" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => pending.resolve({ storage: "persistent-native" }));
    expect(screen.getByText("设置已安全保存")).toBeTruthy();
  });

  it("keeps the full draft and renders only a fixed safe failure", async () => {
    const save = vi.fn().mockRejectedValue(new Error("private-platform-sentinel"));
    const { container } = render(<Settings saveSecurely={save} />);
    const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    fireEvent.change(key, { target: { value: "draft-retained" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByText("安全保存失败，请重试")).toBeTruthy();
    expect(key.value).toBe("draft-retained");
    expect(document.body.textContent).not.toContain("private-platform-sentinel");
  });

  it("does not submit a cleared key until explicit save", () => {
    replaceRuntimeSecrets(new Map([["claude", "committed-key"]]));
    const save = vi.fn().mockResolvedValue({ storage: "persistent-native" });
    render(<Settings saveSecurely={save} />);

    fireEvent.click(screen.getAllByRole("button", { name: "清除" })[0]);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(save.mock.calls[0][0].providers.find((provider) => provider.id === "claude")?.apiKey).toBe("");
  });
});
