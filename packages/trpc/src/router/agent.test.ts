import { describe, expect, it, vi } from "vitest";

import type { TRPCContext } from "../context";
import { AppRouter } from "../root";

const workspaceId = "00000000-0000-4000-8000-000000000001";

function context(options?: { authenticated?: boolean }) {
  const assertMember = vi.fn().mockResolvedValue(undefined);
  const authenticated = options?.authenticated ?? true;
  return {
    assertMember,
    value: {
      logger: {
        info: vi.fn(),
      },
      services: {
        agent: { assertMember },
        modelId: "ornith-1.5-9b",
        modelProvider: "ollama",
        reviewedBehaviorPack: {
          generatedAt: "2026-08-30T00:00:00.000Z",
          model: {
            model: "Ornith-1.5-9B-MLX-4bit",
            provider: "local",
            quantization: "4bit",
            runtime: "mlx",
          },
          version: "daily-20260830T000000000Z-example",
        },
      },
      session: authenticated
        ? {
            claims: { sub: "subject-1" },
            user: {
              email: "owner@example.test",
              id: "user-1",
              issuer: "https://accounts.example.test",
              name: "Owner",
              roles: [],
              subject: "subject-1",
            },
          }
        : null,
      telemetry: {
        trace: async (
          _name: string,
          _attributes: Record<string, boolean | number | string>,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    } as unknown as TRPCContext,
  };
}

describe("agent runtimeInfo", () => {
  it("returns server-owned model and behavior-pack provenance to a member", async () => {
    const fixture = context();

    await expect(
      AppRouter.createCaller(fixture.value).agent.runtimeInfo({ workspaceId }),
    ).resolves.toEqual({
      behaviorPack: {
        generatedAt: "2026-08-30T00:00:00.000Z",
        model: {
          model: "Ornith-1.5-9B-MLX-4bit",
          provider: "local",
          quantization: "4bit",
          runtime: "mlx",
        },
        version: "daily-20260830T000000000Z-example",
      },
      modelId: "ornith-1.5-9b",
      modelProvider: "ollama",
    });
    expect(fixture.assertMember).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId,
    });
  });

  it("rejects anonymous callers before disclosing runtime details", async () => {
    const fixture = context({ authenticated: false });

    await expect(
      AppRouter.createCaller(fixture.value).agent.runtimeInfo({ workspaceId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fixture.assertMember).not.toHaveBeenCalled();
  });
});
