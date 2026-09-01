import { describe, it, expect } from "vitest";
import { addMonth } from "./types";

describe("对标情报 · 月份运算（时区无关）", () => {
  it("向前 +1 正常进位，绝不停在原月（修东八区 toISOString 导致的「点击无效」）", () => {
    expect(addMonth("2024-11", 1)).toBe("2024-12");
    expect(addMonth("2024-12", 1)).toBe("2025-01");   // 跨年
    expect(addMonth("2026-09", 1)).toBe("2026-10");
  });
  it("向后 -1 正好退一月，绝不跳两月", () => {
    expect(addMonth("2026-09", -1)).toBe("2026-08");
    expect(addMonth("2025-01", -1)).toBe("2024-12");   // 跨年
    expect(addMonth("2024-11", -1)).toBe("2024-10");
  });
  it("零位移与往返一致", () => {
    expect(addMonth("2026-09", 0)).toBe("2026-09");
    expect(addMonth(addMonth("2026-09", -1), 1)).toBe("2026-09");
    expect(addMonth(addMonth("2026-03", 1), -1)).toBe("2026-03");
  });
});
