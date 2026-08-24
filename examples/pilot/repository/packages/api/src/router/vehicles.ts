export const soldVehiclesCapability = {
  name: "vehicles.listSold",
  readOnly: true,
  maximumRows: 100,
  authorization: "current-user-tenant-and-vehicle-scope",
} as const;

export type ListSoldVehiclesInput = {
  limit?: number;
  soldFrom: string;
  soldTo: string;
};

// soldFrom is inclusive and soldTo is exclusive. Requests may span at most 31 days.
