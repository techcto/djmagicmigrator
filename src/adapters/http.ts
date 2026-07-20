import type { DestinationContext } from "./types.js";
import { assertDestinationUrl } from "../security.js";

export async function callDestination(context: DestinationContext, apiPath: string, mcpTool: string, payload: unknown): Promise<unknown> {
  const base = assertDestinationUrl(context.destination.baseUrl);
  const url = new URL(context.destination.transport === "mcp" ? "/mcp" : apiPath, base);
  const body = context.destination.transport === "mcp"
    ? { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: mcpTool, arguments: payload } }
    : payload;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${context.credential}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
    throw new Error(`CMS destination request failed for ${url.origin}${url.pathname}${cause}`, { cause: error });
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Destination returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return { response: text }; }
}
