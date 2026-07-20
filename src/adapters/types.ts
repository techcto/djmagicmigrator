import type { CreateJobInput, MigrationManifest } from "../domain.js";

export interface DestinationContext {
  destination: CreateJobInput["destination"];
  credential: string;
  targetName: string;
  referenceTemplateUrl?: string;
}

export interface DestinationAdapter {
  import(manifest: MigrationManifest, context: DestinationContext): Promise<unknown>;
}
