import { AppRole } from "@arlequins/auth";
import { describe, expect, it } from "vitest";
import { deriveTemplateSession } from "./oidc-identity";

const session = {
  claims: { sub: "same-subject" },
  user: {
    email: "user@example.com",
    id: "same-subject",
    issuer: "https://issuer.example.com",
    name: "Example User",
    roles: [],
    subject: "same-subject",
  },
};

describe("deriveTemplateSession", () => {
  it("derives a stable UUID scoped by issuer and grants configured admin role", () => {
    const identity = "https://issuer.example.com|same-subject";
    const first = deriveTemplateSession(session, new Set([identity]));
    const second = deriveTemplateSession(session, new Set([identity]));
    expect(first.user.id).toBe(second.user.id);
    expect(first.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.user.roles).toEqual([AppRole.MEMBER, AppRole.ADMIN]);
  });

  it("does not collide across issuers", () => {
    const other = deriveTemplateSession(
      {
        ...session,
        user: { ...session.user, issuer: "https://other.example.com" },
      },
      new Set(),
    );
    expect(other.user.id).not.toBe(
      deriveTemplateSession(session, new Set()).user.id,
    );
  });
});
