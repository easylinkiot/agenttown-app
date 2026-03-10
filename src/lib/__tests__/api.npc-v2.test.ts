import {
  bindNPCKnowledge,
  bindNPCSkill,
  createKnowledgeDataset,
  createNPC,
  deleteKnowledgeDataset,
  deleteNPC,
  getNPC,
  listKnowledgeDatasets,
  listNPCSessionMessages,
  listNPCSessions,
  listNPCs,
  setAuthToken,
  unbindNPCKnowledge,
  unbindNPCSkill,
  updateKnowledgeDataset,
  updateNPC,
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

describe("npc api v2 mapping", () => {
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

  it("lists NPCs and knowledge datasets with normalized fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          list: [
            {
              id: "npc_1",
              scope: "user",
              owner_user_id: "u_1",
              name: "Demo NPC",
              system_prompt: "You are helpful",
              model_name: "gpt-4.1-mini",
              knowledge_ids: ["ds_1"],
              created_at: 1741000000,
              updated_at: 1741000010,
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          list: [
            {
              id: "ds_1",
              user_id: "u_1",
              name: "Docs",
              entries: [{ id: "entry_1", dataset_id: "ds_1", type: "text", name: "Overview", created_at: 1741000020 }],
              created_at: 1741000000,
              updated_at: 1741000010,
            },
          ],
        })
      );

    const npcs = await listNPCs();
    const datasets = await listKnowledgeDatasets();

    expect(npcs[0]).toMatchObject({
      id: "npc_1",
      name: "Demo NPC",
      systemPrompt: "You are helpful",
      modelName: "gpt-4.1-mini",
      knowledgeIds: ["ds_1"],
    });
    expect(datasets[0]).toMatchObject({
      id: "ds_1",
      name: "Docs",
    });
    expect(datasets[0].entries[0]).toMatchObject({
      id: "entry_1",
      datasetId: "ds_1",
      name: "Overview",
    });

    const [npcUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(npcUrl).toBe("https://api.example.com/v2/npc");
    const [knowledgeUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(knowledgeUrl).toBe("https://api.example.com/v2/knowledge");
  });

  it("creates, updates, fetches, binds, unbinds, and lists NPC chat sessions", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          id: "npc_1",
          scope: "user",
          name: "Builder",
          system_prompt: "You are a helpful demo npc.",
          model_name: "gpt-4.1-mini",
          created_at: 1741000000,
          updated_at: 1741000010,
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: "npc_1",
          scope: "user",
          name: "Builder Updated",
          avatar_url: "https://cdn.example.com/npc.png",
          intro: "Updated intro",
          system_prompt: "You are updated",
          model_name: "gpt-4.1",
          status: "inactive",
          created_at: 1741000000,
          updated_at: 1741000015,
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: "npc_1",
          scope: "user",
          name: "Builder",
          system_prompt: "You are a helpful demo npc.",
          skill_bindings: [
            {
              id: "bind_1",
              npc_id: "npc_1",
              skill_id: "skill_1",
              skill_name: "Professional Reply",
              skill_scope: "system",
              enabled: true,
              priority: 0,
              created_at: "2026-03-06T00:00:00Z",
            },
          ],
          created_at: 1741000000,
          updated_at: 1741000010,
        })
      )
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(mockResponse({ ok: true }))
      .mockResolvedValueOnce(
        mockResponse({
          list: [{ id: "sess_1", title: "First talk", updated_at: 1741000030 }],
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          list: [{ id: "msg_1", role: "assistant", content: "hello" }],
        })
      )
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const created = await createNPC({
      name: "Builder",
      system_prompt: "You are a helpful demo npc.",
      model_name: "gpt-4.1-mini",
    });
    const updated = await updateNPC("npc_1", {
      name: "Builder Updated",
      avatar_url: "https://cdn.example.com/npc.png",
      intro: "Updated intro",
      system_prompt: "You are updated",
      model_name: "gpt-4.1",
      status: "inactive",
    });
    const detail = await getNPC("npc_1");
    await bindNPCSkill("npc_1", "skill_1", "user");
    await unbindNPCSkill("npc_1", "bind_1");
    await bindNPCKnowledge("npc_1", "ds_1");
    await unbindNPCKnowledge("npc_1", "ds_1");
    const sessions = await listNPCSessions("npc_1", { limit: 10, eventNum: 50 });
    const messages = await listNPCSessionMessages("npc_1", "sess_1");
    await deleteNPC("npc_1");

    expect(created.id).toBe("npc_1");
    expect(updated).toMatchObject({
      id: "npc_1",
      name: "Builder Updated",
      avatarUrl: "https://cdn.example.com/npc.png",
      intro: "Updated intro",
      systemPrompt: "You are updated",
      modelName: "gpt-4.1",
      status: "inactive",
    });
    expect(detail.skillBindings[0]).toMatchObject({
      id: "bind_1",
      skillId: "skill_1",
      skillName: "Professional Reply",
      skillScope: "system",
    });
    expect(sessions[0]).toMatchObject({ id: "sess_1", title: "First talk" });
    expect(messages[0]).toMatchObject({ id: "msg_1", role: "assistant", content: "hello" });

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api.example.com/v2/npc");
    expect(createInit.method).toBe("POST");

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe("https://api.example.com/v2/npc/npc_1");
    expect(updateInit.method).toBe("PATCH");

    const [detailUrl] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(detailUrl).toBe("https://api.example.com/v2/npc/npc_1");

    const [bindUrl, bindInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(bindUrl).toBe("https://api.example.com/v2/npc/npc_1/skills/skill_1");
    expect(bindInit.method).toBe("POST");
    expect(bindInit.body).toBe(JSON.stringify({ skill_scope: "user" }));

    const [unbindUrl, unbindInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    expect(unbindUrl).toBe("https://api.example.com/v2/npc/npc_1/skills/bind_1");
    expect(unbindInit.method).toBe("DELETE");

    const [bindKnowledgeUrl, bindKnowledgeInit] = fetchMock.mock.calls[5] as [string, RequestInit];
    expect(bindKnowledgeUrl).toBe("https://api.example.com/v2/npc/npc_1/knowledge/ds_1");
    expect(bindKnowledgeInit.method).toBe("POST");

    const [unbindKnowledgeUrl, unbindKnowledgeInit] = fetchMock.mock.calls[6] as [string, RequestInit];
    expect(unbindKnowledgeUrl).toBe("https://api.example.com/v2/npc/npc_1/knowledge/ds_1");
    expect(unbindKnowledgeInit.method).toBe("DELETE");

    const [sessionsUrl] = fetchMock.mock.calls[7] as [string, RequestInit];
    expect(sessionsUrl).toBe("https://api.example.com/v2/npc/npc_1/sessions?limit=10&event_num=50");

    const [messagesUrl] = fetchMock.mock.calls[8] as [string, RequestInit];
    expect(messagesUrl).toBe("https://api.example.com/v2/npc/npc_1/sessions/sess_1/messages");

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[9] as [string, RequestInit];
    expect(deleteUrl).toBe("https://api.example.com/v2/npc/npc_1");
    expect(deleteInit.method).toBe("DELETE");
  });

  it("creates, updates, and deletes knowledge datasets through /v2/knowledge", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          id: "ds_1",
          user_id: "u_1",
          name: "Release Notes",
          entries: [{ id: "entry_1", dataset_id: "ds_1", type: "file", name: "release-notes.md" }],
          created_at: 1741000000,
          updated_at: 1741000010,
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          id: "ds_1",
          user_id: "u_1",
          name: "Release Notes Updated",
          entries: [{ id: "entry_1", dataset_id: "ds_1", type: "file", name: "release-notes.md" }],
          created_at: 1741000000,
          updated_at: 1741000015,
        })
      )
      .mockResolvedValueOnce(mockResponse({ ok: true, id: "ds_1" }));

    const created = await createKnowledgeDataset({
      name: "Release Notes",
      entries: [
        {
          name: "release-notes.md",
          type: "file",
          fileUrl: "https://cdn.example.com/release-notes.md",
          contentType: "text/markdown",
          size: 128,
        },
      ],
    });
    const updated = await updateKnowledgeDataset("ds_1", {
      name: "Release Notes Updated",
      addEntries: [
        {
          name: "release-notes.md",
          type: "file",
          fileUrl: "https://cdn.example.com/release-notes.md",
          contentType: "text/markdown",
          size: 128,
        },
      ],
      removeEntryIds: ["entry_old"],
    });
    const deleted = await deleteKnowledgeDataset("ds_1");

    expect(created).toMatchObject({ id: "ds_1", name: "Release Notes" });
    expect(updated).toMatchObject({ id: "ds_1", name: "Release Notes Updated" });
    expect(deleted).toMatchObject({ ok: true, id: "ds_1" });

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api.example.com/v2/knowledge");
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(String(createInit.body))).toEqual(
      {
        name: "Release Notes",
        entries: [
          {
            name: "release-notes.md",
            type: "file",
            s3_url: "https://cdn.example.com/release-notes.md",
            content_type: "text/markdown",
            size: 128,
          },
        ],
      }
    );

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe("https://api.example.com/v2/knowledge/ds_1");
    expect(updateInit.method).toBe("PATCH");
    expect(JSON.parse(String(updateInit.body))).toEqual(
      {
        name: "Release Notes Updated",
        add_entries: [
          {
            name: "release-notes.md",
            type: "file",
            s3_url: "https://cdn.example.com/release-notes.md",
            content_type: "text/markdown",
            size: 128,
          },
        ],
        remove_entry_ids: ["entry_old"],
      }
    );

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(deleteUrl).toBe("https://api.example.com/v2/knowledge/ds_1");
    expect(deleteInit.method).toBe("DELETE");
  });
});
