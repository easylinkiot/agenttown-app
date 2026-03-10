import {
  collectMentionMatches,
  extractActiveMention,
  replaceActiveMention,
  type MentionDraftCandidate,
} from "../mention-helpers";

function createCandidate(overrides?: Partial<MentionDraftCandidate>): MentionDraftCandidate {
  return {
    key: "member-1",
    kind: "member",
    token: "John",
    memberId: "member_1",
    memberType: "human",
    ...overrides,
  };
}

describe("mention helpers", () => {
  it("extracts the active trailing mention query", () => {
    expect(extractActiveMention("hello @jo")).toEqual({
      query: "jo",
      start: 6,
    });
  });

  it("replaces only the active mention token", () => {
    expect(replaceActiveMention("hello @jo", "John 2")).toBe("hello @John 2 ");
  });

  it("matches mention tokens exactly instead of prefix matching", () => {
    const matches = collectMentionMatches("hello @John 2 please review", [
      createCandidate({ key: "john", token: "John", memberId: "member_john" }),
      createCandidate({ key: "john-2", token: "John 2", memberId: "member_john_2" }),
    ]);

    expect(matches.map((item) => item.key)).toEqual(["john-2"]);
  });

  it("matches special mentions alongside members", () => {
    const matches = collectMentionMatches("@All please sync with @MyBot and @Alice", [
      createCandidate({ key: "all", kind: "all", token: "All", memberId: undefined, memberType: undefined }),
      createCandidate({ key: "mybot", kind: "mybot", token: "MyBot", memberId: undefined, memberType: undefined }),
      createCandidate({ key: "alice", token: "Alice", memberId: "member_alice" }),
    ]);

    expect(matches.map((item) => item.key)).toEqual(["all", "mybot", "alice"]);
  });

  it("matches mentions followed by punctuation, including CJK punctuation", () => {
    const matches = collectMentionMatches("@Elon Musk，设计看起来不错。请 @Alice！", [
      createCandidate({ key: "elon", token: "Elon Musk", memberId: "member_elon", memberType: "role" }),
      createCandidate({ key: "alice", token: "Alice", memberId: "member_alice", memberType: "human" }),
    ]);

    expect(matches.map((item) => item.key)).toEqual(["elon", "alice"]);
  });
});
