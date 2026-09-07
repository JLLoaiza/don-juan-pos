import { createHttpClient } from "./httpClient";
import { createHealthClient } from "./health";

const DEFAULT_BASE_URL = "http://localhost:3000";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL;

const httpClient = createHttpClient({ baseUrl: apiBaseUrl });

export const apiClient = {
  health: createHealthClient(httpClient),
};
