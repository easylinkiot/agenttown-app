import {
  createCustomSkill,
  deleteCustomSkill,
  executeCustomSkill,
  listInstalledSkillsV2,
  listCustomSkills,
  listSkillCatalog,
  patchCustomSkill,
  setV2SkillInstalled,
  setAuthToken,
} from "../api";

function mockResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: {
      get: () => null,
    },
  } as unknown as Response;
}

describe("skills api v2 mapping", () => {
  const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    setAuthToken("access-token");
  });

  afterEach(() => {
    setAuthToken(null);
    fetchMock.mockReset();
    process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
  });

  it("lists skill catalog from /v2/skills/catalog", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        list: [{ id: "sys_1", name: "Summary", description: "desc", category: "writing", icon: "file", installed: true }],
      })
    );

    const rows = await listSkillCatalog();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "sys_1",
      name: "Summary",
      description: "desc",
      type: "builtin",
      source: "system",
      installed: true,
      removable: true,
      permissionScope: "chat:read",
      version: "v2",
      tags: ["writing"],
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v2/skills/catalog");
  });

  it("lists custom skills from /v2/skills", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        list: [
          {
            id: "sk_1",
            name: "My Skill",
            description: "custom desc",
            skill_content: "# SKILL",
            enabled: true,
            version: 3,
            created_at: "2026-03-05T00:00:00Z",
            updated_at: "2026-03-05T00:00:01Z",
          },
        ],
      })
    );
    const rows = await listCustomSkills();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "sk_1",
      name: "My Skill",
      markdown: "# SKILL",
      version: "3",
      enabled: true,
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v2/skills");
  });

  it("lists installed skills from /v2/skills using scope as source truth", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        list: [
          {
            id: "sys_1",
            name: "Summary",
            description: "system desc",
            scope: "system",
            installed: true,
            version: 1,
          },
          {
            id: "sk_1",
            name: "My Skill",
            description: "custom desc",
            scope: "user",
            skill_content: "# SKILL",
            installed: true,
            version: 3,
          },
        ],
      })
    );

    const rows = await listInstalledSkillsV2();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "sys_1",
      source: "system",
      installed: true,
      editable: false,
      removable: true,
    });
    expect(rows[1]).toMatchObject({
      id: "sk_1",
      source: "user",
      installed: true,
      editable: true,
      markdown: "# SKILL",
    });
  });

  it("creates/patches/deletes via /v2/skills and execute via /v1/skills/{id}/execute", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          id: "sk_1",
          name: "My Skill",
          description: "desc",
          skill_content: "# SKILL",
          enabled: true,
          version: 1,
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: "sk_1",
          name: "My Skill Updated",
          description: "desc2",
          skill_content: "# SKILL2",
          enabled: true,
          version: 2,
        })
      )
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(mockResponse({ skillId: "sk_1", output: "done" }));

    const created = await createCustomSkill({
      name: "My Skill",
      markdown: "# SKILL",
      description: "desc",
    });
    expect(created.id).toBe("sk_1");

    const updated = await patchCustomSkill("sk_1", {
      name: "My Skill Updated",
      markdown: "# SKILL2",
      description: "desc2",
    });
    expect(updated.version).toBe("2");

    const deleted = await deleteCustomSkill("sk_1");
    expect(deleted).toEqual({ ok: true, id: "sk_1" });

    const output = await executeCustomSkill("sk_1", { input: "run" });
    expect(output).toMatchObject({ skillId: "sk_1", output: "done" });

    const [u1, i1] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(u1).toBe("https://api.example.com/v2/skills");
    expect(i1.method).toBe("POST");

    const [u2, i2] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(u2).toBe("https://api.example.com/v2/skills/sk_1");
    expect(i2.method).toBe("PATCH");

    const [u3, i3] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(u3).toBe("https://api.example.com/v2/skills/sk_1");
    expect(i3.method).toBe("DELETE");

    const [u4, i4] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(u4).toBe("https://api.example.com/v1/skills/sk_1/execute");
    expect(i4.method).toBe("POST");
  });

  it("toggles system skill install through /v2/skills/{id}/install", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    await setV2SkillInstalled("sys_1", true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v2/skills/sys_1/install");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ install: true }));
  });
});
