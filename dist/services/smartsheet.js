import axios, { AxiosError } from "axios";
import { SMARTSHEET_API_BASE } from "../constants.js";
let apiToken = null;
let client = null;
export function initSmartsheetClient(token) {
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
export function getClient() {
    if (!client) {
        const envToken = process.env.SMARTSHEET_API_TOKEN;
        if (!envToken) {
            throw new Error("Smartsheet API token not initialized. Set SMARTSHEET_API_TOKEN environment variable or call initSmartsheetClient().");
        }
        initSmartsheetClient(envToken);
    }
    return client;
}
export async function smartsheetGet(path, params) {
    const response = await getClient().get(path, { params });
    return response.data;
}
export async function smartsheetPost(path, data, params) {
    const response = await getClient().post(path, data, { params });
    return response.data;
}
export async function smartsheetPut(path, data) {
    const response = await getClient().put(path, data);
    return response.data;
}
export async function smartsheetDelete(path) {
    const response = await getClient().delete(path);
    return response.data;
}
export function handleApiError(error) {
    if (error instanceof AxiosError) {
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.message ?? "";
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
        }
        else if (error.code === "ECONNABORTED") {
            return "Error: Request timed out. Smartsheet API may be slow — please retry.";
        }
        else if (error.code === "ENOTFOUND") {
            return "Error: Cannot reach api.smartsheet.com. Check network connectivity.";
        }
    }
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
export function truncateIfNeeded(text, limit) {
    if (text.length <= limit)
        return text;
    const truncMsg = `\n\n[Response truncated at ${limit} chars. Use pagination parameters to retrieve more data.]`;
    return text.slice(0, limit - truncMsg.length) + truncMsg;
}
