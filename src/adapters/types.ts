import type { CreateJobInput, MigrationManifest, ModuleManifest, SharePointModuleJobInput, SiteJobInput } from "../domain.js";

export interface DestinationContext {
  destination: CreateJobInput["destination"];
  credential: string;
  targetName?: string;
  referenceTemplateUrl?: string;
}

export interface DestinationAdapter {
  import(manifest: MigrationManifest, context: DestinationContext): Promise<unknown>;
  importModule(manifest: ModuleManifest, context: DestinationContext): Promise<unknown>;
}

export function siteContext(job: SiteJobInput, credential: string): DestinationContext {
  return { destination: job.destination, credential, targetName: job.targetName, referenceTemplateUrl: job.options.referenceTemplateUrl };
}

export function moduleContext(job: SharePointModuleJobInput, credential: string): DestinationContext {
  return { destination: job.destination, credential };
}
