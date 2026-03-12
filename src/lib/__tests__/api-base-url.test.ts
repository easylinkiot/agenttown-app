import {
  DEFAULT_API_ENV,
  getApiEnvironment,
  getDefaultApiBaseUrl,
  resolveApiBaseUrl,
} from "../api-base-url";

describe("api base url config", () => {
  const originalApiEnv = process.env.EXPO_PUBLIC_API_ENV;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_ENV = originalApiEnv;
  });

  it("defaults to stage environment", () => {
    delete process.env.EXPO_PUBLIC_API_ENV;

    expect(getApiEnvironment()).toBe(DEFAULT_API_ENV);
    expect(getDefaultApiBaseUrl()).toBe("https://agenttown-api.kittens.cloud");
  });

  it("supports dev environment alias", () => {
    process.env.EXPO_PUBLIC_API_ENV = "development";

    expect(getApiEnvironment()).toBe("dev");
    expect(getDefaultApiBaseUrl()).toBe("https://api.agtown.ai");
  });

  it("supports local environment alias", () => {
    expect(getApiEnvironment("localhost")).toBe("local");
    expect(getDefaultApiBaseUrl("local")).toBe("http://127.0.0.1:8080");
  });

  it("maps localhost to 10.0.2.2 on android", () => {
    expect(
      resolveApiBaseUrl({
        explicitBaseUrl: "http://localhost:8080/",
        platformOS: "android",
        isReleaseBuild: false,
      })
    ).toBe("http://10.0.2.2:8080");
  });

  it("falls back to configured environment base url for release localhost builds", () => {
    expect(
      resolveApiBaseUrl({
        apiEnv: "dev",
        explicitBaseUrl: "http://127.0.0.1:8080",
        platformOS: "ios",
        isReleaseBuild: true,
      })
    ).toBe("https://api.agtown.ai");
  });

  it("allows localhost in release for e2e overrides", () => {
    expect(
      resolveApiBaseUrl({
        apiEnv: "stage",
        e2eBaseUrl: "http://127.0.0.1:8080",
        platformOS: "ios",
        isReleaseBuild: true,
        allowLocalhostInRelease: true,
      })
    ).toBe("http://127.0.0.1:8080");
  });
});
