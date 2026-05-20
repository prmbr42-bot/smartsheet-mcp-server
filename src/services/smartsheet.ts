import axios, { AxiosError, AxiosInstance } from "axios";
import { SMARTSHEET_API_BASE } from "../constants.js";

let apiToken: string | null = null;
let client: AxiosInstance | null = null;

export function initSmartsheetClient(token: string): void {
  apiToken = token;
  client = axios.create({
    baseURL: SMARTSHEET_API_BASE,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export function getClient(): AxiosInstance {
  if (!client) {
    const envToken = process.env.SMARTSHEET_API_TOKEN;
    if (!envToken) {
      throw new Error(
        "Smartsheet API token not initialized. Set SMARTSHEET_API_TOKEN environment variable or call initSmartsheetClient()."
      );
    }
    initSmartsheetClient(envToken);
  }
  return client!;
}

export async function smartsheetGet<T>(
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await getClient().get<T>(path, { params });
  return response.data;
}

export async function smartsheetPost<T>(
  path: string,
  data?: unknown,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await getClient().post<T>(path, data, { params });
  return response.data;
}

export async function smartsheetPut<T>(
  path: string,
  data?: unknown
): Promise<T> {
  const response = await getClient().put<T>(path, data);
  return response.data;
}

export async function smartsheetDelete<T>(path: string): Promise<T> {
  const response = await getClient().delete<T>(path);
  return response.data;
}

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const message =
        (error.response.data as { message?: string })?.message ?? "";
      switch (status) {
        case 400:
          return `Error 400 Bad Request: ${message || "Invalid request parameters."}`;
        case 401:
          return "Error 401 Unauthorized: Invalid or expired API token. Check SMARTSHEET_API_TOKEN.";
        case 403:
          return `Error 403 Forbidden: You do not have permission for this resource. ${message}`;
        case 404:
          return `Error 404 Not Found: Resource does not exist. Verify the ID is correct. ${message}`;
        case 429:
          return "Error 429 Rate Limited: Too many requests. Wait a moment and retry.";
        case 500:
          return "Error 500 Server Error: Smartsheet service error. Retry after a brief delay.";
        default:
          return `Error ${status}: ${message || error.message}`;
      }
    } else if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. Smartsheet API may be slow — please retry.";
    } else if (error.code === "ENOTFOUND") {
      return "Error: Cannot reach api.smartsheet.com. Check network connectivity.";
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

export function truncateIfNeeded(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncMsg = `\n\n[Response truncated at ${limit} chars. Use pagination parameters to retrieve more data.]`;
  return text.slice(0, limit - truncMsg.length) + truncMsg;
}
