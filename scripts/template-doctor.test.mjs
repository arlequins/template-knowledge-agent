import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateEnvironment,
  parseDoctorArgs,
  parseEnv,
} from "./template-doctor.mjs";

describe("template doctor", () => {
  it("parses quoted and plain environment values", () => {
    assert.deepEqual(parseEnv('A=one\nB="two words"\n# C=ignored\n'), {
      A: "one",
      B: "two words",
    });
  });

  it("accepts machine-readable and strict options", () => {
    assert.deepEqual(
      parseDoctorArgs(["--json", "--strict", "--env-file", ".env.test"]),
      { envFile: ".env.test", json: true, strict: true },
    );
  });

  it("reports missing values and an inconsistent OIDC issuer", () => {
    const results = evaluateEnvironment({
      env: {
        NEXT_PUBLIC_OIDC_AUTHORITY: "http://browser",
        OIDC_ISSUER_URL: "http://api",
      },
      features: ["auth", "sst"],
    });
    assert.equal(
      results.find(({ name }) => name === "environment")?.status,
      "fail",
    );
    assert.equal(
      results.find(({ name }) => name === "oidc-contract")?.status,
      "fail",
    );
    assert.equal(
      results.find(({ name }) => name === "sst-contract")?.status,
      "warn",
    );
  });

  it("validates Google mode without comparing against the mock browser authority", () => {
    const results = evaluateEnvironment({
      env: {
        AUTH_PROVIDER: "google",
        AUTH_ALLOWED_EMAILS: "owner@example.com",
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
        NEXT_PUBLIC_OIDC_AUTHORITY: "http://localhost:5556",
        OIDC_ISSUER_URL: "https://accounts.google.com",
      },
      features: ["auth"],
    });
    assert.equal(
      results.find(({ name }) => name === "oidc-contract")?.status,
      undefined,
    );
    assert.equal(
      results.find(({ name }) => name === "google-auth-contract")?.status,
      "pass",
    );
  });
});
