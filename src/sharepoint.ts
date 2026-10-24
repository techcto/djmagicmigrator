import type { ModuleManifest, ModuleManifestRecord, SharePointModuleJobInput } from "./domain.js";

type Progress = (count: number) => Promise<void>;

export async function discoverSharePointModule(
  job: SharePointModuleJobInput,
  credential: string,
  progress: Progress,
): Promise<ModuleManifest> {
  const list = encodeURIComponent(job.source.listTitle.replace(/'/g, "''"));
  const query = new URLSearchParams({
    "$select": job.source.select.join(","),
    "$top": String(job.source.pageSize),
  });
  if (job.source.filter) query.set("$filter", job.source.filter);
  if (job.source.orderBy) query.set("$orderby", job.source.orderBy);
  let next: string | undefined = new URL(
    `/_api/web/lists/getbytitle('${list}')/items?${query.toString()}`,
    job.source.siteUrl,
  ).toString();
  const records: ModuleManifestRecord[] = [];
  const failures: Array<{ sourceId: string; error: string }> = [];

  while (next) {
    const response = await fetch(next, {
      headers: {
        Accept: "application/json;odata=nometadata",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`SharePoint returned HTTP ${response.status} for ${safeUrl(next)}`);
    const payload = await response.json() as Record<string, unknown>;
    const rows = rowsFrom(payload);
    for (const row of rows) {
      try {
        records.push(mapRecord(job, row));
      } catch (error) {
        const sourceId = String(row.UniqueId ?? row.Id ?? row.ID ?? "unknown");
        failures.push({ sourceId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    await progress(records.length + failures.length);
    next = nextLink(payload, job.source.siteUrl);
  }

  return {
    version: "1.0",
    source: { platform: "sharepoint", siteUrl: job.source.siteUrl, listTitle: job.source.listTitle },
    generatedAt: new Date().toISOString(),
    module: job.module,
    records,
    failures,
    dryRun: job.options.dryRun,
    publish: job.options.publish,
  };
}

function rowsFrom(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(payload.value)) return payload.value as Array<Record<string, unknown>>;
  const d = payload.d as Record<string, unknown> | undefined;
  if (d && Array.isArray(d.results)) return d.results as Array<Record<string, unknown>>;
  return [];
}

function nextLink(payload: Record<string, unknown>, base: string): string | undefined {
  const d = payload.d as Record<string, unknown> | undefined;
  const value = payload["@odata.nextLink"] ?? payload["odata.nextLink"] ?? d?.__next;
  return typeof value === "string" && value !== "" ? new URL(value, base).toString() : undefined;
}

function mapRecord(job: SharePointModuleJobInput, row: Record<string, unknown>): ModuleManifestRecord {
  const fields: Record<string, unknown> = {};
  const assets: ModuleManifestRecord["assets"] = [];
  for (const mapping of job.module.fields) {
    const raw = readPath(row, mapping.source);
    const value = transform(raw, mapping.transform);
    if (mapping.required && (value === null || value === undefined || value === "")) {
      throw new Error(`Required SharePoint field ${mapping.source} is empty`);
    }
    if (mapping.type === "file" && typeof value === "string" && value !== "") {
      const sourceUrl = new URL(value, job.source.siteUrl).toString();
      assets.push({ field: mapping.target, name: decodeURIComponent(sourceUrl.split("/").pop() || "file"), sourceUrl });
    } else {
      fields[mapping.target] = value;
    }
  }
  const sourceId = String(fields[job.module.identityField] ?? row.UniqueId ?? row.Id ?? row.ID ?? "");
  if (!sourceId) throw new Error(`Identity field ${job.module.identityField} is empty`);
  return { sourceId, fields, assets };
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
  }, row);
}

function transform(value: unknown, kind: SharePointModuleJobInput["module"]["fields"][number]["transform"]): unknown {
  if (value === null || value === undefined) return null;
  if (kind === "none") return value;
  if (kind === "trim") return String(value).trim();
  if (kind === "lowercase") return String(value).trim().toLowerCase();
  if (kind === "integer") return Number.parseInt(String(value), 10);
  if (kind === "boolean") return value === true || value === 1 || /^(1|true|yes)$/i.test(String(value));
  if (kind === "after-pipe") return String(value).split("|").pop()?.trim() ?? "";
  if (kind === "date" || kind === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${kind} value: ${String(value)}`);
    return kind === "date" ? date.toISOString().slice(0, 10) : date.toISOString();
  }
  return value;
}

function safeUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.delete("access_token");
  return url.toString();
}
