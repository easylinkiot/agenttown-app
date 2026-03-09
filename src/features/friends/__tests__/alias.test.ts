import { getFriendAlias, normalizeFriendAliases, resolveFriendDisplayName } from "@/src/features/friends/alias";

describe("friend alias helpers", () => {
  it("normalizes only non-empty aliases", () => {
    expect(
      normalizeFriendAliases({
        "friend:1": " Jason ",
        "friend:2": "",
        "": "ignored",
      })
    ).toEqual({
      "friend:1": "Jason",
    });
  });

  it("prefers friend id alias and falls back to user id alias", () => {
    const aliases = {
      "user:u1": "Teacher",
      "friend:f1": "Mr. Wang",
    };
    expect(getFriendAlias(aliases, { id: "f1", userId: "u1" })).toBe("Mr. Wang");
    expect(getFriendAlias(aliases, { id: "", userId: "u1" })).toBe("Teacher");
  });

  it("resolves alias before original friend name", () => {
    const aliases = {
      "friend:f1": "AWS Jason",
    };
    expect(resolveFriendDisplayName(aliases, { id: "f1", userId: "u1", name: "apple.final.1772574776" })).toBe(
      "AWS Jason"
    );
    expect(resolveFriendDisplayName({}, { id: "f1", userId: "u1", name: "apple.final.1772574776" })).toBe(
      "apple.final.1772574776"
    );
  });
});
