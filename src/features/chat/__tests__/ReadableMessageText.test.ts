import { buildReadableMessageBlocks } from "@/src/features/chat/ReadableMessageText";

describe("buildReadableMessageBlocks", () => {
  it("splits long prose into readable paragraphs", () => {
    const blocks = buildReadableMessageBlocks(
      "第一句先说明背景，第二句补充关键约束，第三句提出建议，第四句说明执行方式，第五句强调风险控制。"
    );

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });

  it("keeps bullet lists as bullet blocks", () => {
    const blocks = buildReadableMessageBlocks("行动项：\n- 整理需求\n- 分配负责人\n1. 跟进截止时间");

    expect(blocks).toEqual([
      { kind: "heading", text: "行动项：" },
      { kind: "bullet", marker: "-", text: "整理需求" },
      { kind: "bullet", marker: "-", text: "分配负责人" },
      { kind: "bullet", marker: "1.", text: "跟进截止时间" },
    ]);
  });
});
