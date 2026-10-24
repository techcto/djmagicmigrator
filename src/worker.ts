import { Worker } from "bullmq";
import { adapterFor } from "./adapters/index.js";
import { destinationCredential } from "./credentials.js";
import { crawl } from "./crawler.js";
import type { MigrationJob, SharePointModuleJobInput, SiteJobInput } from "./domain.js";
import { connection } from "./queue.js";
import { discoverSharePointModule } from "./sharepoint.js";
import { getJob, putJob } from "./storage.js";
import { moduleContext, siteContext } from "./adapters/types.js";

new Worker("site-migrations", async (queued) => {
  const job = await getJob(String(queued.id));
  if (!job || job.status === "cancelled") return;
  const update = async (changes: Partial<MigrationJob>) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
    await putJob(job);
  };
  try {
    if (job.kind === "sharepoint-module") {
      const moduleJob = job as MigrationJob & SharePointModuleJobInput;
      await update({ status: "discovering", progress: 1, error: undefined });
      const sourceCredential = await destinationCredential(moduleJob.source.secretArn);
      const manifest = await discoverSharePointModule(moduleJob, sourceCredential, async (count) => {
        const current = await getJob(job.id);
        if (current?.status === "cancelled") throw new Error("Migration was cancelled");
        await update({ progress: Math.min(65, Math.max(1, count)) });
      });
      if (manifest.failures.length > 0 && !moduleJob.options.allowPartial) {
        throw new Error(`SharePoint discovery failed for ${manifest.failures.length} record(s); no CMS import was started.`);
      }
      await update({ status: "importing", progress: 70 });
      const credential = await destinationCredential(moduleJob.destination.secretArn);
      const adapter = adapterFor(moduleJob.destination.platform);
      const result = await adapter.importModule(manifest, moduleContext(moduleJob, credential));
      await update({ status: "completed", progress: 100, result });
      return;
    }

    const siteJob = job as MigrationJob & SiteJobInput;
    await update({ status: "crawling", progress: 1, error: undefined });
    const manifest = await crawl(siteJob, async (count) => {
      const current = await getJob(job.id);
      if (current?.status === "cancelled") throw new Error("Migration was cancelled");
      await update({ progress: Math.min(65, Math.max(1, Math.floor((count / siteJob.maxPages) * 65))) });
    });
    if (siteJob.options.pageMappings && manifest.failures.length > 0 && !siteJob.options.allowPartial) {
      throw new Error(`Approved migration crawl failed for ${manifest.failures.length} page(s); no CMS import was started.`);
    }
    await update({ status: "importing", progress: 70 });
    const credential = await destinationCredential(siteJob.destination.secretArn);
    const result = await adapterFor(siteJob.destination.platform).import(manifest, siteContext(siteJob, credential));
    await update({ status: "completed", progress: 100, result });
  } catch (error) {
    const current = await getJob(job.id);
    if (current?.status === "cancelled") return;
    await update({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}, { connection, concurrency: Number(process.env.DJMAGIC_WORKER_CONCURRENCY || 1) });

console.log("DJ Magic Migrator worker started");
