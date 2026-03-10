import { buildFriendQrDeepLink, extractFriendQrToken } from "../api";

describe("friend qr helpers", () => {
  const token = "fq1.payload.signature";

  it("builds a deep link for a friend qr token", () => {
    expect(buildFriendQrDeepLink(token)).toBe(`agenttown://friend-qr?token=${encodeURIComponent(token)}`);
  });

  it("extracts the raw token directly", () => {
    expect(extractFriendQrToken(token)).toBe(token);
  });

  it("extracts a token from a deep link", () => {
    expect(extractFriendQrToken(`agenttown://friend-qr?token=${encodeURIComponent(token)}`)).toBe(token);
  });

  it("extracts a token from shared text", () => {
    const shared = `UsChat Friend QR\nagenttown://friend-qr?token=${encodeURIComponent(token)}\nFallback token: ${token}`;
    expect(extractFriendQrToken(shared)).toBe(token);
  });
});
