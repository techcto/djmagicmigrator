import { z } from "zod";

export const destinationSchema = z.object({
  platform: z.enum(["cms", "wordpress", "drupal"]),
  transport: z.enum(["api", "mcp"]),
  baseUrl: z.string().url(),
  secretArn: z.string().min(1).optional(),
});

export const pageMappingSchema = z.object({
  sourceUrl: z.string().url(),
  destinationPath: z.string().min(1),
  title: z.string().optional(),
});

const siteJobSchema = z.object({
  kind: z.literal("site").default("site"),
  sourceUrl: z.string().url(),
  targetName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  maxPages: z.number().int().min(1).max(10000).default(100),
  destination: destinationSchema,
  options: z.object({
    lowercaseHyphenatedPaths: z.boolean().default(true),
    includeDocuments: z.boolean().default(false),
    includeImages: z.boolean().default(true),
    includeScriptsAndStyles: z.boolean().default(true),
    publish: z.boolean().default(false),
    allowPartial: z.boolean().default(false),
    referenceTemplateUrl: z.string().url().optional(),
    pageMappings: z.array(pageMappingSchema).min(1).max(10000).optional(),
  }).default({}),
});

const moduleFieldSchema = z.object({
  source: z.string().min(1),
  target: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(["string", "text", "integer", "boolean", "date", "datetime", "url", "file"]),
  required: z.boolean().default(false),
  transform: z.enum(["none", "trim", "lowercase", "date", "datetime", "integer", "boolean", "after-pipe"]).default("none"),
});

export const sharePointModuleJobSchema = z.object({
  kind: z.literal("sharepoint-module"),
  source: z.object({
    siteUrl: z.string().url(),
    listTitle: z.string().min(1),
    select: z.array(z.string().min(1)).min(1).max(200),
    filter: z.string().max(2000).optional(),
    orderBy: z.string().max(500).optional(),
    pageSize: z.number().int().min(1).max(5000).default(500),
    secretArn: z.string().min(1).optional(),
  }),
  destination: destinationSchema,
  module: z.object({
    id: z.number().int().positive().optional(),
    name: z.string().min(1).max(128),
    type: z.literal("datatable").default("datatable"),
    parentAssetCategoryId: z.number().int().positive().optional(),
    identityField: z.string().regex(/^[a-z][a-z0-9_]*$/),
    titleField: z.string().regex(/^[a-z][a-z0-9_]*$/),
    assetCategoryId: z.number().int().positive().optional(),
    fields: z.array(moduleFieldSchema).min(1).max(200),
  }),
  options: z.object({
    dryRun: z.boolean().default(true),
    publish: z.boolean().default(false),
    allowPartial: z.boolean().default(false),
  }).default({}),
});

export const createJobSchema = z.union([siteJobSchema, sharePointModuleJobSchema]);

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type SiteJobInput = z.infer<typeof siteJobSchema>;
export type SharePointModuleJobInput = z.infer<typeof sharePointModuleJobSchema>;
export type JobStatus = "queued" | "discovering" | "crawling" | "importing" | "completed" | "failed" | "cancelled";

export interface MigrationPage {
  sourceUrl: string;
  destinationPath: string;
  title: string;
  html: string;
  assets: string[];
  links: string[];
}

export interface MigrationFailure {
  sourceUrl: string;
  error: string;
}

export interface MigrationManifest {
  version: "1.0";
  sourceUrl: string;
  generatedAt: string;
  pages: MigrationPage[];
  linkMap: Record<string, string>;
  failures: MigrationFailure[];
}

export interface ModuleManifestRecord {
  sourceId: string;
  fields: Record<string, unknown>;
  assets: Array<{ field: string; name: string; sourceUrl: string }>;
}

export interface ModuleManifest {
  version: "1.0";
  source: { platform: "sharepoint"; siteUrl: string; listTitle: string };
  generatedAt: string;
  module: SharePointModuleJobInput["module"];
  records: ModuleManifestRecord[];
  failures: Array<{ sourceId: string; error: string }>;
  dryRun: boolean;
  publish: boolean;
}

export type MigrationJob = CreateJobInput & {
  id: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  result?: unknown;
};
