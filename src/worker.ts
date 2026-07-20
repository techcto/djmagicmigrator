import { Worker } from "bullmq";
import { adapterFor } from "./adapters/index.js";
import { destinationCredential } from "./credentials.js";
import { crawl } from "./crawler.js";
import type { MigrationJob } from "./domain.js";
import { connection } from "./queue.js";
import { getJob, putJob } from "./storage.js";

new Worker("site-migrations", async (queued) => {
  const job = await getJob(String(queued.id));
  if (!job || job.status === "cancelled") return;
  const update = async (changes: Partial<MigrationJob>) => {
    Object.assign(job, changes, { updatedAt: new Date().toISOString() });
    await putJob(job);
  };
  try {
    await update({ status: "crawling", progress: 1, error: undefined });
    const manifest = await crawl(job, async (count) => {
      const current = await getJob(job.id);
      if (current?.status === "cancelled") throw new Error("Migration was cancelled");
      await update({ progress: Math.min(65, Math.max(1, Math.floor((count / job.maxPages) * 65))) });
    });
    await update({ status: "importing", progress: 70 });
    const credential = await destinationCredential(job.destination.secretArn);
    const result = await adapterFor(job.destination.platform).import(manifest, {
      destination: job.destination,
      credential,
      targetName: job.targetName,
      referenceTemplateUrl: job.options.referenceTemplateUrl,
    });
    await update({ status: "completed", progress: 100, result });
  } catch (error) {
    const current = await getJob(job.id);
    if (current?.status === "cancelled") return;
    await update({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}, { connection, concurrency: Number(process.env.DJMAGIC_WORKER_CONCURRENCY || 1) });

console.log("DJ Magic Migrator worker started");
