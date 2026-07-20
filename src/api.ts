import express, { type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { config } from "./config.js";
import { createJobSchema, type MigrationJob } from "./domain.js";
import { getJob, putJob } from "./storage.js";
import { migrationQueue } from "./queue.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

function authenticate(request: Request, response: Response, next: NextFunction): void {
  if (config.apiKeys.length === 0) return next();
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "") || request.header("x-api-key") || "";
  if (!config.apiKeys.some((key) => key.length === token.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(token)))) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

async function startJob(input: unknown): Promise<MigrationJob> {
  const parsed = createJobSchema.parse(input);
  if (parsed.destination.platform !== "cms") throw new Error("Only the CMS adapter is enabled in this release");
  const now = new Date().toISOString();
  const job: MigrationJob = { ...parsed, id: crypto.randomUUID(), status: "queued", progress: 0, createdAt: now, updatedAt: now };
  await putJob(job);
  await migrationQueue.add("migrate", {}, { jobId: job.id, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
  return job;
}

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "djmagicmigrator" }));
app.post("/api/v1/jobs", authenticate, async (request, response) => {
  try { response.status(202).json(await startJob(request.body)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get("/api/v1/jobs/:id", authenticate, async (request, response) => {
  const job = await getJob(String(request.params.id));
  response.status(job ? 200 : 404).json(job || { error: "Not found" });
});
app.post("/api/v1/jobs/:id/cancel", authenticate, async (request, response) => {
  const job = await getJob(String(request.params.id));
  if (!job) return response.status(404).json({ error: "Not found" });
  job.status = "cancelled"; job.updatedAt = new Date().toISOString(); await putJob(job);
  response.json(job);
});

app.post("/mcp", authenticate, async (request, response) => {
  const { id, method, params } = request.body || {};
  try {
    if (method === "tools/list") return response.json({ jsonrpc: "2.0", id, result: { tools: [
      { name: "start-site-import", description: "Start a bounded CMS website migration.", inputSchema: { type: "object", properties: { sourceUrl: { type: "string", format: "uri" }, targetName: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, maxPages: { type: "integer", minimum: 1, maximum: 10000 }, destination: { type: "object" }, options: { type: "object" } }, required: ["sourceUrl", "targetName", "destination"] } },
      { name: "get-site-import", description: "Read migration progress and its final result.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
      { name: "cancel-site-import", description: "Cancel a queued migration.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    ] } });
    if (method !== "tools/call") throw new Error("Unsupported MCP method");
    const name = params?.name; const args = params?.arguments || {};
    let result: unknown;
    if (name === "start-site-import") result = await startJob(args);
    else if (name === "get-site-import") result = await getJob(String(args.id));
    else if (name === "cancel-site-import") {
      const job = await getJob(String(args.id)); if (!job) throw new Error("Not found");
      job.status = "cancelled"; job.updatedAt = new Date().toISOString(); await putJob(job); result = job;
    } else throw new Error("Unknown tool");
    response.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
  } catch (error) {
    response.json({ jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } });
  }
});

app.listen(config.port, "0.0.0.0", () => console.log(`DJ Magic Migrator API listening on ${config.port}`));
