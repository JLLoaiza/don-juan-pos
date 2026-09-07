import { HealthResponseSchema, type HealthResponse } from "@don-juan/contracts";
import type { HttpClient } from "./httpClient";

export interface HealthClient {
  getHealth(): Promise<HealthResponse>;
}

export function createHealthClient(http: HttpClient): HealthClient {
  return {
    getHealth: () => http.getJson("/health", HealthResponseSchema),
  };
}
