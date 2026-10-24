import assert from "node:assert/strict";
import test from "node:test";
import type { SharePointModuleJobInput } from "./domain.js";
import { discoverSharePointModule } from "./sharepoint.js";

test("discovers paged SharePoint rows and creates a normalized module manifest", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (requests.length === 1) {
      return Response.json({
        value: [{ UniqueId: "alpha", Title: " First record ", Active: "Yes", FileRef: "/files/report one.pdf" }],
        "@odata.nextLink": "/sites/content/_api/next-page",
      });
    }
    return Response.json({ value: [{ UniqueId: "beta", Title: "Second record", Active: false, FileRef: null }] });
  };

  const job: SharePointModuleJobInput = {
    kind: "sharepoint-module",
    source: {
      siteUrl: "https://tenant.example.com/sites/content",
      listTitle: "Public Reports",
      select: ["UniqueId", "Title", "Active", "FileRef"],
      pageSize: 100,
    },
    destination: { platform: "cms", transport: "mcp", baseUrl: "https://cms.example.com" },
    module: {
      name: "Public Reports",
      type: "datatable",
      identityField: "source_id",
      titleField: "title",
      fields: [
        { source: "UniqueId", target: "source_id", type: "string", required: true, transform: "none" },
        { source: "Title", target: "title", type: "string", required: true, transform: "trim" },
        { source: "Active", target: "active", type: "boolean", required: false, transform: "boolean" },
        { source: "FileRef", target: "document", type: "file", required: false, transform: "none" },
      ],
    },
    options: { dryRun: true, publish: false, allowPartial: false },
  };

  try {
    const progress: number[] = [];
    const manifest = await discoverSharePointModule(job, "secret", async (count) => { progress.push(count); });
    assert.equal(manifest.records.length, 2);
    assert.deepEqual(progress, [1, 2]);
    assert.deepEqual(manifest.records[0].fields, { source_id: "alpha", title: "First record", active: true });
    assert.deepEqual(manifest.records[0].assets, [{
      field: "document",
      name: "report one.pdf",
      sourceUrl: "https://tenant.example.com/files/report%20one.pdf",
    }]);
    assert.equal(manifest.records[1].sourceId, "beta");
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
