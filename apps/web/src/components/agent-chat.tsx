"use client";

import { Button } from "@arlequins/ui/button";
import { Input } from "@arlequins/ui/input";
import { Textarea } from "@arlequins/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "~/auth/provider";
import { env } from "~/env";
import { useTRPC } from "~/trpc/react";

function messageError(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

function streamErrorMessage(error: unknown): string {
  const message = messageError(error);
  if (
    message === "Local model request failed" ||
    message === "Local model completion is not configured"
  ) {
    return "OpenAI 응답을 받지 못했습니다. `.env.localhost`의 API 키와 모델 설정을 확인한 뒤 다시 보내세요.";
  }
  if (message === "응답 스트림을 시작하지 못했습니다.") {
    return "에이전트 API에 연결하지 못했습니다. 로컬 개발 서버가 실행 중인지 확인한 뒤 다시 보내세요.";
  }
  return message;
}

function MessageContent({ content }: { content: string }) {
  const tokens = content.split(
    /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g,
  );
  return (
    <p className="whitespace-pre-wrap text-sm leading-6">
      {tokens.map((token, index) => {
        if (/^\*\*.+\*\*$/.test(token) || /^__.+__$/.test(token))
          return (
            <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>
          );
        if (/^`.+`$/.test(token))
          return (
            <code
              className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10"
              key={`${token}-${index}`}
            >
              {token.slice(1, -1)}
            </code>
          );
        if (/^\*.+\*$/.test(token) || /^_.+_$/.test(token))
          return <em key={`${token}-${index}`}>{token.slice(1, -1)}</em>;
        return token;
      })}
    </p>
  );
}

function MessageCitations({
  messageId,
  workspaceId,
}: {
  messageId: string;
  workspaceId: string;
}) {
  const trpc = useTRPC();
  const citations = useQuery(
    trpc.agent.messageCitations.queryOptions({ messageId, workspaceId }),
  );
  if (!citations.data?.length) return null;
  return (
    <details className="mt-3 border-t pt-3 text-xs">
      <summary className="cursor-pointer font-medium">
        인용 {citations.data.length}개
      </summary>
      <ul className="text-muted-foreground mt-2 space-y-1">
        {citations.data.map((citation) => (
          <li key={`${citation.documentId}-${citation.ordinal}`}>
            {citation.filename}
            {citation.locator ? ` · ${citation.locator}` : ""}
            {citation.content ? ` — ${citation.content.slice(0, 120)}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function AgentChat() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [conversationQuery, setConversationQuery] = useState("");
  const [isRenamingConversation, setIsRenamingConversation] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [documentContentType, setDocumentContentType] = useState<
    "text/html" | "text/markdown" | "text/plain"
  >("text/plain");
  const [documentFileError, setDocumentFileError] = useState<string>();
  const [documentFilename, setDocumentFilename] = useState("notes.txt");
  const [memoryContent, setMemoryContent] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [investigationResolution, setInvestigationResolution] = useState("");
  const [investigationAnswer, setInvestigationAnswer] = useState("");
  const [investigationEvidenceIds, setInvestigationEvidenceIds] = useState("");
  const [investigationLanguage, setInvestigationLanguage] = useState<
    "en" | "ja" | "ko"
  >("ko");
  const [selectedInvestigationId, setSelectedInvestigationId] =
    useState<string>();
  const [question, setQuestion] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [streamError, setStreamError] = useState<string>();
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const workspaces = useQuery(trpc.agent.workspaces.queryOptions());
  const conversations = useQuery({
    ...trpc.agent.conversations.queryOptions({
      workspaceId: workspaceId ?? "",
    }),
    enabled: Boolean(workspaceId),
  });
  const messages = useQuery({
    ...trpc.agent.messages.queryOptions({
      conversationId: conversationId ?? "",
      workspaceId: workspaceId ?? "",
    }),
    enabled: Boolean(workspaceId && conversationId),
  });
  const documents = useQuery({
    ...trpc.agent.documents.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
  });
  const indexRuns = useQuery({
    ...trpc.agent.indexRuns.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
  });
  const memories = useQuery({
    ...trpc.agent.memories.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
  });
  const usage = useQuery({
    ...trpc.agent.usage.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId),
  });
  const isOwner =
    workspaces.data?.find((workspace) => workspace.id === workspaceId)?.role ===
    "owner";
  const visibleConversations = (conversations.data ?? []).filter(
    (conversation) =>
      conversation.title
        .toLocaleLowerCase()
        .includes(conversationQuery.trim().toLocaleLowerCase()),
  );
  const auditLog = useQuery({
    ...trpc.agent.auditLog.queryOptions({ workspaceId: workspaceId ?? "" }),
    enabled: Boolean(workspaceId && isOwner),
  });
  const investigations = useQuery({
    ...trpc.agent.investigations.queryOptions({
      workspaceId: workspaceId ?? "",
      status: "queued",
    }),
    enabled: Boolean(workspaceId && isOwner),
  });

  useEffect(() => {
    if (!workspaceId && workspaces.data?.[0])
      setWorkspaceId(workspaces.data[0].id);
  }, [workspaceId, workspaces.data]);

  useEffect(() => {
    if (!conversationId && conversations.data?.[0]) {
      setConversationId(conversations.data[0].id);
    }
  }, [conversationId, conversations.data]);

  useEffect(() => {
    const selected = conversations.data?.find(
      (conversation) => conversation.id === conversationId,
    );
    setConversationTitle(selected?.title ?? "");
    setIsRenamingConversation(false);
  }, [conversationId, conversations.data]);

  const scrollTrigger = `${messages.data?.at(-1)?.id ?? ""}:${streamedText.length}`;
  useEffect(() => {
    if (!scrollTrigger) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scrollTrigger]);

  const createWorkspace = useMutation(
    trpc.agent.createWorkspace.mutationOptions({
      onSuccess: async (workspace) => {
        setWorkspaceId(workspace.id);
        setConversationId(undefined);
        setWorkspaceName("");
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.workspaces.queryKey(),
        });
      },
    }),
  );
  const createConversation = useMutation(
    trpc.agent.createConversation.mutationOptions({
      onSuccess: async (conversation) => {
        setConversationId(conversation?.id);
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.conversations.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const renameConversation = useMutation(
    trpc.agent.renameConversation.mutationOptions({
      onSuccess: async () => {
        setIsRenamingConversation(false);
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.conversations.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const archiveConversation = useMutation(
    trpc.agent.archiveConversation.mutationOptions({
      onSuccess: async () => {
        setConversationId(undefined);
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.conversations.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const ingestTextDocument = useMutation(
    trpc.agent.ingestTextDocument.mutationOptions({
      onSuccess: async () => {
        setDocumentContent("");
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.documents.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const deleteDocument = useMutation(
    trpc.agent.deleteDocument.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.documents.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const startIndex = useMutation(
    trpc.agent.startIndex.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.indexRuns.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const createMemory = useMutation(
    trpc.agent.createMemory.mutationOptions({
      onSuccess: () => {
        setMemoryContent("");
      },
    }),
  );
  const reviewMemory = useMutation(
    trpc.agent.reviewMemory.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.memories.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const deleteMemory = useMutation(
    trpc.agent.deleteMemory.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.memories.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  const addWorkspaceMember = useMutation(
    trpc.agent.addWorkspaceMember.mutationOptions({
      onSuccess: () => setMemberUserId(""),
    }),
  );
  const submitFeedback = useMutation(
    trpc.agent.submitFeedback.mutationOptions(),
  );
  const reviewInvestigation = useMutation(
    trpc.agent.reviewInvestigation.mutationOptions({
      onSuccess: async () => {
        setInvestigationAnswer("");
        setInvestigationResolution("");
        setInvestigationEvidenceIds("");
        setInvestigationLanguage("ko");
        setSelectedInvestigationId(undefined);
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.investigations.queryKey({
            workspaceId: workspaceId ?? "",
            status: "queued",
          }),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.agent.auditLog.queryKey({
            workspaceId: workspaceId ?? "",
          }),
        });
      },
    }),
  );
  function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!name) return;
    const slug = `${
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "workspace"
    }-${Date.now()}`;
    createWorkspace.mutate({ name, slug });
  }

  function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !documentContent.trim() || !documentFilename.trim())
      return;
    ingestTextDocument.mutate({
      content: documentContent,
      contentType: documentContentType,
      filename: documentFilename.trim(),
      workspaceId,
    });
  }

  async function selectDocumentFile(file?: File) {
    setDocumentFileError(undefined);
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name) && file.type !== "text/plain") {
      setDocumentFileError(
        "현재는 안전하게 텍스트와 Markdown 파일만 지원합니다.",
      );
      return;
    }
    if (file.size > 1_000_000) {
      setDocumentFileError("문서는 1MB 이하여야 합니다.");
      return;
    }
    setDocumentFilename(file.name);
    setDocumentContentType(
      file.type === "text/html" || /\.html?$/i.test(file.name)
        ? "text/html"
        : /\.md$/i.test(file.name)
          ? "text/markdown"
          : "text/plain",
    );
    setDocumentContent(await file.text());
  }

  function submitMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !memoryContent.trim()) return;
    createMemory.mutate({
      content: memoryContent,
      sourceConversationId: conversationId,
      workspaceId,
    });
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !conversationId || !question.trim()) return;
    const questionText = question.trim();
    const selectedConversation = conversations.data?.find(
      (conversation) => conversation.id === conversationId,
    );
    const shouldAutoTitle =
      messages.data?.length === 0 &&
      (selectedConversation?.title === "새 대화" ||
        selectedConversation?.title === "New conversation");
    setIsStreaming(true);
    setStreamedText("");
    setStreamError(undefined);
    try {
      const response = await fetch(
        `${env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/agent/stream`,
        {
          method: "POST",
          headers: {
            ...(user?.access_token && !user.expired
              ? { Authorization: `Bearer ${user.access_token}` }
              : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationId,
            question: questionText,
            workspaceId,
          }),
        },
      );
      if (!response.ok || !response.body) {
        throw new Error("응답 스트림을 시작하지 못했습니다.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const value = JSON.parse(line) as {
            message?: string;
            text?: string;
            type: "complete" | "delta" | "error";
          };
          if (value.type === "delta") {
            setStreamedText((text) => text + (value.text ?? ""));
          }
          if (value.type === "error") throw new Error(value.message);
        }
      }
      setQuestion("");
      await queryClient.invalidateQueries({
        queryKey: trpc.agent.messages.queryKey({ conversationId, workspaceId }),
      });
      if (shouldAutoTitle) {
        const generatedTitle = questionText.replace(/\s+/g, " ").slice(0, 48);
        try {
          await renameConversation.mutateAsync({
            conversationId,
            title: generatedTitle,
            workspaceId,
          });
        } catch {
          // The conversation remains usable; the user can rename it manually.
        }
      }
    } catch (error) {
      setStreamError(streamErrorMessage(error));
    } finally {
      setIsStreaming(false);
      setStreamedText("");
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  if (workspaces.isLoading)
    return (
      <p className="text-muted-foreground">워크스페이스를 불러오는 중입니다.</p>
    );
  if (workspaces.isError)
    return <p className="text-destructive">{messageError(workspaces.error)}</p>;

  if (!workspaceId) {
    return (
      <form className="rounded-xl border p-6" onSubmit={submitWorkspace}>
        <h2 className="text-lg font-semibold">첫 워크스페이스 만들기</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          대화와 문서는 이 워크스페이스 안에서만 공유됩니다.
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            aria-label="워크스페이스 이름"
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="예: 개인 연구"
            value={workspaceName}
          />
          <Button disabled={createWorkspace.isPending} type="submit">
            만들기
          </Button>
        </div>
        {createWorkspace.isError && (
          <p className="text-destructive mt-3 text-sm">
            {messageError(createWorkspace.error)}
          </p>
        )}
      </form>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[15rem_1fr]">
      <aside className="rounded-xl border p-3">
        <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
          워크스페이스
        </p>
        <select
          className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
          onChange={(event) => {
            setWorkspaceId(event.target.value);
            setConversationId(undefined);
            setConversationQuery("");
          }}
          value={workspaceId}
        >
          {workspaces.data?.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <Button
          className="mt-4 w-full"
          disabled={createConversation.isPending}
          onClick={() =>
            createConversation.mutate({ title: "새 대화", workspaceId })
          }
          variant="outline"
        >
          새 대화
        </Button>
        <Input
          aria-label="대화 검색"
          className="mt-4"
          onChange={(event) => setConversationQuery(event.target.value)}
          placeholder="대화 검색"
          value={conversationQuery}
        />
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
          {visibleConversations.map((conversation) => (
            <button
              className={`w-full rounded-md px-2 py-2 text-left text-sm ${conversationId === conversation.id ? "bg-accent" : "hover:bg-accent/60"}`}
              key={conversation.id}
              onClick={() => setConversationId(conversation.id)}
              type="button"
            >
              {conversation.title}
            </button>
          ))}
          {visibleConversations.length === 0 && (
            <p className="text-muted-foreground px-2 py-2 text-xs">
              {conversationQuery.trim()
                ? "검색 결과가 없습니다."
                : "아직 대화가 없습니다."}
            </p>
          )}
        </div>
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            로컬 지식 추가
          </summary>
          <form className="mt-3 space-y-2" onSubmit={submitDocument}>
            <Input
              accept=".md,.txt,text/plain"
              aria-label="문서 파일 선택"
              onChange={(event) => selectDocumentFile(event.target.files?.[0])}
              type="file"
            />
            <Input
              aria-label="문서 이름"
              onChange={(event) => setDocumentFilename(event.target.value)}
              value={documentFilename}
            />
            <Textarea
              aria-label="문서 내용"
              onChange={(event) => setDocumentContent(event.target.value)}
              placeholder="텍스트를 붙여 넣으면 이 워크스페이스에서 검색합니다."
              value={documentContent}
            />
            <Button
              className="w-full"
              disabled={!documentContent.trim() || ingestTextDocument.isPending}
              type="submit"
              variant="outline"
            >
              {ingestTextDocument.isPending ? "등록 중…" : "문서 등록"}
            </Button>
            {ingestTextDocument.isError && (
              <p className="text-destructive text-xs">
                {messageError(ingestTextDocument.error)}
              </p>
            )}
            {documentFileError && (
              <p className="text-destructive text-xs" role="alert">
                {documentFileError}
              </p>
            )}
          </form>
          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-sm font-medium">문서</p>
            {documents.data?.length === 0 && (
              <p className="text-muted-foreground text-xs">
                등록된 문서가 없습니다.
              </p>
            )}
            {documents.data?.map((document) => {
              const latestRun = indexRuns.data?.find(
                (run) => run.documentId === document.id,
              );
              return (
                <div
                  className="rounded-md border p-2 text-xs"
                  key={document.id}
                >
                  <p className="truncate font-medium">{document.filename}</p>
                  <p className="text-muted-foreground mt-1">
                    {document.status} · {Math.ceil(document.sizeBytes / 1024)}{" "}
                    KB
                    {latestRun ? ` · 색인 ${latestRun.status}` : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="text-muted-foreground hover:underline"
                      disabled={startIndex.isPending}
                      onClick={() =>
                        workspaceId &&
                        startIndex.mutate({
                          documentId: document.id,
                          provider: "local",
                          workspaceId,
                        })
                      }
                      type="button"
                    >
                      색인 요청
                    </button>
                    <button
                      className="text-destructive hover:underline"
                      disabled={deleteDocument.isPending}
                      onClick={() =>
                        workspaceId &&
                        deleteDocument.mutate({
                          documentId: document.id,
                          workspaceId,
                        })
                      }
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            운영 현황
          </summary>
          <p className="text-muted-foreground mt-2 text-xs">
            문서 {usage.data?.documents ?? 0} · 메시지{" "}
            {usage.data?.messages ?? 0} · 기억 {usage.data?.memories ?? 0}
          </p>
          <p className="text-muted-foreground mt-2 break-all font-mono text-[10px]">
            인덱싱용 워크스페이스 ID: {workspaceId}
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            소유자만 문서 삭제와 기억 검토를 수행할 수 있습니다.
          </p>
          {isOwner && workspaceId && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!memberUserId.trim()) return;
                addWorkspaceMember.mutate({
                  role: "member",
                  userId: memberUserId.trim(),
                  workspaceId,
                });
              }}
            >
              <Input
                aria-label="멤버 사용자 ID"
                onChange={(event) => setMemberUserId(event.target.value)}
                placeholder="멤버 사용자 UUID"
                value={memberUserId}
              />
              <Button size="sm" type="submit" variant="outline">
                추가
              </Button>
            </form>
          )}
          {isOwner && auditLog.data?.length ? (
            <ul className="mt-3 space-y-1 text-xs">
              {auditLog.data.slice(0, 5).map((entry) => (
                <li
                  className="text-muted-foreground"
                  key={`${entry.action}-${entry.createdAt}`}
                >
                  {entry.action} · {new Date(entry.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : null}
          {isOwner && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium">조사 요청 검토</p>
              <p className="text-muted-foreground mt-1 text-xs">
                소유자만 원문 답변을 확인하고 승인된 수정 내용을 다음 일일
                평가에 반영할 수 있습니다.
              </p>
              {investigations.data?.length ? (
                <ul className="mt-3 space-y-3">
                  {investigations.data.map((item) => {
                    const selected = selectedInvestigationId === item.id;
                    return (
                      <li
                        className="rounded-md border p-3 text-xs"
                        key={item.id}
                      >
                        <p className="font-medium">{item.messageContent}</p>
                        {item.feedbackComment && (
                          <p className="text-muted-foreground mt-1">
                            피드백: {item.feedbackComment}
                          </p>
                        )}
                        <button
                          className="mt-2 text-muted-foreground hover:underline"
                          onClick={() => {
                            setSelectedInvestigationId(
                              selected ? undefined : item.id,
                            );
                            setInvestigationAnswer(
                              typeof item.findings === "object" &&
                                item.findings &&
                                "correctedAnswer" in item.findings &&
                                typeof item.findings.correctedAnswer ===
                                  "string"
                                ? item.findings.correctedAnswer
                                : "",
                            );
                            setInvestigationEvidenceIds(
                              typeof item.findings === "object" &&
                                item.findings &&
                                "evidenceIds" in item.findings &&
                                Array.isArray(item.findings.evidenceIds)
                                ? item.findings.evidenceIds.join(", ")
                                : "",
                            );
                            setInvestigationLanguage(
                              typeof item.findings === "object" &&
                                item.findings &&
                                "language" in item.findings &&
                                (item.findings.language === "en" ||
                                  item.findings.language === "ja" ||
                                  item.findings.language === "ko")
                                ? item.findings.language
                                : "ko",
                            );
                          }}
                          type="button"
                        >
                          {selected ? "검토 닫기" : "검토 열기"}
                        </button>
                        {selected && (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              aria-label="수정 답변"
                              onChange={(event) =>
                                setInvestigationAnswer(event.target.value)
                              }
                              placeholder="근거를 확인한 뒤 사용할 수정 답변(선택)"
                              value={investigationAnswer}
                            />
                            <Input
                              aria-label="근거 청크 ID"
                              onChange={(event) =>
                                setInvestigationEvidenceIds(event.target.value)
                              }
                              placeholder="근거 청크 ID (쉼표로 구분, 필수)"
                              value={investigationEvidenceIds}
                            />
                            <select
                              aria-label="답변 언어"
                              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                              onChange={(event) =>
                                setInvestigationLanguage(
                                  event.target.value as "en" | "ja" | "ko",
                                )
                              }
                              value={investigationLanguage}
                            >
                              <option value="ko">한국어</option>
                              <option value="en">English</option>
                              <option value="ja">日本語</option>
                            </select>
                            <Input
                              aria-label="검토 메모"
                              onChange={(event) =>
                                setInvestigationResolution(event.target.value)
                              }
                              placeholder="검토 메모(선택)"
                              value={investigationResolution}
                            />
                            <div className="flex gap-2">
                              <Button
                                disabled={reviewInvestigation.isPending}
                                onClick={() =>
                                  workspaceId &&
                                  reviewInvestigation.mutate({
                                    findings: {
                                      correctedAnswer:
                                        investigationAnswer.trim() || undefined,
                                      evidenceIds: investigationEvidenceIds
                                        .split(",")
                                        .map((id) => id.trim())
                                        .filter(Boolean),
                                      forbiddenClaims: [],
                                      language: investigationLanguage,
                                      requiredTerms: [],
                                    },
                                    investigationId: item.id,
                                    resolution:
                                      investigationResolution.trim() ||
                                      undefined,
                                    status: "approved",
                                    workspaceId,
                                  })
                                }
                                size="sm"
                              >
                                승인
                              </Button>
                              <Button
                                disabled={reviewInvestigation.isPending}
                                onClick={() =>
                                  workspaceId &&
                                  reviewInvestigation.mutate({
                                    investigationId: item.id,
                                    resolution:
                                      investigationResolution.trim() ||
                                      undefined,
                                    status: "rejected",
                                    workspaceId,
                                  })
                                }
                                size="sm"
                                variant="outline"
                              >
                                보류/거절
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">
                  대기 중인 조사 요청이 없습니다.
                </p>
              )}
            </div>
          )}
        </details>
      </aside>
      <div className="flex min-h-[34rem] flex-col rounded-xl border">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          {isRenamingConversation ? (
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !workspaceId ||
                  !conversationId ||
                  !conversationTitle.trim()
                )
                  return;
                renameConversation.mutate({
                  conversationId,
                  title: conversationTitle.trim(),
                  workspaceId,
                });
              }}
            >
              <Input
                aria-label="대화 제목"
                autoFocus
                className="h-8"
                maxLength={256}
                onChange={(event) => setConversationTitle(event.target.value)}
                value={conversationTitle}
              />
              <Button
                disabled={renameConversation.isPending}
                size="sm"
                type="submit"
              >
                저장
              </Button>
              <Button
                onClick={() => setIsRenamingConversation(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                취소
              </Button>
            </form>
          ) : (
            <h2 className="truncate font-semibold">
              {conversations.data?.find(
                (conversation) => conversation.id === conversationId,
              )?.title ?? "대화를 선택하세요"}
            </h2>
          )}
          {conversationId && !isRenamingConversation && (
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={() => setIsRenamingConversation(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                이름 변경
              </Button>
              <Button
                disabled={archiveConversation.isPending}
                onClick={() =>
                  workspaceId &&
                  archiveConversation.mutate({ conversationId, workspaceId })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                보관
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.data?.map((message) => (
            <article
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-3 text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-xl bg-muted px-4 py-3"
              }
              key={message.id}
            >
              <MessageContent content={message.content} />
              {message.role === "assistant" && (
                <div className="mt-3 flex gap-2">
                  <button
                    className="text-muted-foreground text-xs hover:underline"
                    disabled={submitFeedback.isPending}
                    onClick={() =>
                      submitFeedback.mutate({
                        kind: "helpful",
                        messageId: message.id,
                        workspaceId,
                      })
                    }
                    type="button"
                  >
                    도움됨
                  </button>
                  <button
                    className="text-muted-foreground text-xs hover:underline"
                    disabled={submitFeedback.isPending}
                    onClick={() =>
                      submitFeedback.mutate({
                        kind: "needs-investigation",
                        messageId: message.id,
                        workspaceId,
                      })
                    }
                    type="button"
                  >
                    조사 요청
                  </button>
                </div>
              )}
              {message.role === "assistant" && workspaceId && (
                <MessageCitations
                  messageId={message.id}
                  workspaceId={workspaceId}
                />
              )}
            </article>
          ))}
          {isStreaming && (
            <article className="mr-auto max-w-[85%] rounded-xl bg-muted px-4 py-3">
              <MessageContent content={streamedText || "생성 중…"} />
            </article>
          )}
          <div aria-hidden="true" ref={messagesEndRef} />
          {!conversationId && (
            <p className="text-muted-foreground text-sm">
              새 대화를 만들어 시작하세요.
            </p>
          )}
        </div>
        <form className="border-t p-4" onSubmit={submitQuestion}>
          <Textarea
            aria-label="질문"
            disabled={!conversationId || isStreaming}
            onKeyDown={handleQuestionKeyDown}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="무엇을 도와드릴까요?"
            value={question}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              Enter로 전송 · Ctrl+Enter로 줄바꿈 · 응답은 현재 로컬 Ollama에서
              생성됩니다.
            </p>
            <Button
              disabled={!question.trim() || !conversationId || isStreaming}
              type="submit"
            >
              {isStreaming ? "생성 중…" : "보내기"}
            </Button>
          </div>
          {streamError && (
            <p className="text-destructive mt-3 text-sm" role="alert">
              {streamError}
            </p>
          )}
        </form>
        <details className="border-t px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            기억 후보 추가
          </summary>
          <form className="mt-3 flex gap-2" onSubmit={submitMemory}>
            <Input
              aria-label="기억 내용"
              onChange={(event) => setMemoryContent(event.target.value)}
              placeholder="예: 사용자는 한국어로 답변받기를 선호한다"
              value={memoryContent}
            />
            <Button
              disabled={!memoryContent.trim() || createMemory.isPending}
              type="submit"
              variant="outline"
            >
              저장
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-xs">
            후보 기억은 승인 API를 거친 뒤에만 답변 문맥으로 사용됩니다.
          </p>
          {memories.data?.length ? (
            <ul className="mt-3 space-y-2 text-xs">
              {memories.data.map((memory) => (
                <li className="rounded border p-2" key={memory.id}>
                  <p>{memory.content}</p>
                  <p className="text-muted-foreground mt-1">
                    {memory.status} · 중요도 {memory.importance}
                  </p>
                  {isOwner && memory.status === "candidate" && workspaceId && (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="text-muted-foreground hover:underline"
                        onClick={() =>
                          reviewMemory.mutate({
                            memoryId: memory.id,
                            status: "approved",
                            workspaceId,
                          })
                        }
                        type="button"
                      >
                        승인
                      </button>
                      <button
                        className="text-muted-foreground hover:underline"
                        onClick={() =>
                          reviewMemory.mutate({
                            memoryId: memory.id,
                            status: "rejected",
                            workspaceId,
                          })
                        }
                        type="button"
                      >
                        거절
                      </button>
                      <button
                        className="text-destructive hover:underline"
                        onClick={() =>
                          deleteMemory.mutate({
                            memoryId: memory.id,
                            workspaceId,
                          })
                        }
                        type="button"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      </div>
    </section>
  );
}
