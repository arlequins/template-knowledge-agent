"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "~/trpc/react";

export default function NoticesPage() {
  const recent = useQuery(
    api.notices.listRecent.queryOptions({
      limit: 20,
      publishedSince: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    }),
  );

  return <pre>{JSON.stringify(recent.data ?? [], null, 2)}</pre>;
}
