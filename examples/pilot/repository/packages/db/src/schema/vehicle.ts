export type VehicleRow = {
  id: string;
  model: string;
  soldAt: Date | null;
  tenantId: string;
};

export const vehicleIndexes = ["tenantId", "soldAt"] as const;
