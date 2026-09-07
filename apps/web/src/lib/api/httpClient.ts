import type { z } from "zod";
import { ApiErrorSchema, type ApiError } from "@don-juan/contracts";

export type ApiRequestFailureCause = "network" | "http";

export class ApiRequestError extends Error {
  readonly kind: ApiRequestFailureCause;
  readonly status: number | undefined;
  readonly apiError: ApiError | undefined;

  constructor(message: string, kind: ApiRequestFailureCause, status?: number, apiError?: ApiError) {
    super(message);
    this.name = "ApiRequestError";
    this.kind = kind;
    this.status = status;
    this.apiError = apiError;
  }
}

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface HttpClient {
  getJson<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T>;
  postJson<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T>;
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createHttpClient({ baseUrl, fetchImpl }: HttpClientConfig): HttpClient {
  async function send<T>(method: "GET" | "POST", path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    // Resolved per call (not captured once as a default parameter) so a
    // caller that swaps out globalThis.fetch after this client was built
    // (e.g. a test) is honored.
    const doFetch = fetchImpl ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      throw new ApiRequestError(`No se pudo contactar ${baseUrl}${path}.`, "network");
    }

    if (!response.ok) {
      const body = await readErrorBody(response);
      const parsed = ApiErrorSchema.safeParse(body);
      const message = parsed.success ? parsed.data.message : `Error HTTP ${response.status}`;
      throw new ApiRequestError(message, "http", response.status, parsed.success ? parsed.data : undefined);
    }

    const data = await response.json();
    return schema.parse(data);
  }

  return {
    getJson: (path, schema, options) => send("GET", path, schema, options),
    postJson: (path, schema, options) => send("POST", path, schema, options),
  };
}
