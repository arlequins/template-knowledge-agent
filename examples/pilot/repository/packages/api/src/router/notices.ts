export const noticesCapability = {
  name: "notices.listRecent",
  readOnly: true,
  maximumRows: 20,
  authorization: "current-user-tenant",
} as const;

export type ListRecentNoticesInput = {
  limit?: number;
  publishedSince: string;
};
