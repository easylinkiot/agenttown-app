const {
  ensureAccount,
  listAssistSkillsV2,
  runAssistV2,
  listSkillsV2,
  createSkillV2,
  patchSkillV2,
  deleteSkillV2,
} = require("./support/api-helper");
const assert = require("node:assert/strict");

describe("Skills V2 API E2E", () => {
  const runTag = Date.now().toString(36);
  const accountEmail = `e2e.skills.v2.${runTag}@example.com`;
  const password = "Test1234!";
  const displayName = "E2E Skills V2";
  let auth = null;
  let skillId = "";

  beforeAll(async () => {
    auth = await ensureAccount(accountEmail, password, displayName);
    assert.ok(auth?.token, "auth token should be present");
  });

  afterAll(async () => {
    if (!auth?.token || !skillId) return;
    try {
      await deleteSkillV2(auth.token, skillId);
    } catch {
      // ignore cleanup errors
    }
  });

  it("runs assist and custom skill CRUD on v2", async () => {
    const assistSkills = await listAssistSkillsV2(auth.token);
    assert.equal(Array.isArray(assistSkills?.skills), true, "assist skills should be an array");
    assert.ok(assistSkills.skills.length > 0, "assist skills should not be empty");

    const assistSkillId = assistSkills.skills[0]?.id;
    assert.equal(typeof assistSkillId, "string");

    const assistResult = await runAssistV2(auth.token, {
      skill_id: assistSkillId,
      messages: [{ role: "user", content: "请给我一条更礼貌的回复。" }],
    });
    assert.equal(assistResult?.skill_id, assistSkillId);
    assert.ok(assistResult?.candidates, "assist candidates should exist");

    const created = await createSkillV2(auth.token, {
      name: `e2e_skill_${runTag}`,
      description: "e2e custom skill",
      skill_content: "# SKILL\n\n你是一个简洁助手。",
    });
    skillId = String(created?.id || "");
    assert.ok(skillId, "created skill id should exist");

    const listed = await listSkillsV2(auth.token);
    const list = Array.isArray(listed?.list) ? listed.list : Array.isArray(listed) ? listed : [];
    assert.equal(list.some((item) => String(item?.id || "") === skillId), true);

    const updated = await patchSkillV2(auth.token, skillId, {
      name: `e2e_skill_${runTag}_updated`,
      description: "updated",
      skill_content: "# SKILL\n\n先给结论，再给依据。",
    });
    assert.equal(String(updated?.id || ""), skillId);

    const deleted = await deleteSkillV2(auth.token, skillId);
    assert.equal(Boolean(deleted?.ok), true);
    skillId = "";
  });
});
