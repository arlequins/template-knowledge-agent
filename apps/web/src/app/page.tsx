"use client";

import { useAuth } from "~/auth/provider";
import { AuthStatus } from "~/auth/status";
import { AgentChat } from "~/components/agent-chat";

export default function HomePage() {
  const { user } = useAuth();
  return (
    <main className="container max-w-3xl py-16">
      <AuthStatus />
      <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Provider-neutral agent foundation
      </p>
      <h1 className="mt-3 text-4xl font-bold">Knowledge Agent Template</h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        대화, 기억, 지식 검색, 피드백을 로컬에서 먼저 검증하고 필요한 AWS
        서비스만 선택적으로 연결하는 에이전트 템플릿입니다.
      </p>
      {!user ? (
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["Local first", "MinIO, OIDC Mock, local model"],
            ["Evidence", "Workspace-scoped retrieval and citations"],
            ["Cost aware", "S3 and Lambda by default; Bedrock is opt-in"],
          ].map(([title, description]) => (
            <article className="rounded-lg border p-4" key={title}>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {description}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-10">
          <AgentChat />
        </section>
      )}
    </main>
  );
}
