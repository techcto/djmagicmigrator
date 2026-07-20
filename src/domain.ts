import { z } from "zod";

export const destinationSchema = z.object({
  platform: z.enum(["cms", "wordpress", "drupal"]),
  transport: z.enum(["api", "mcp"]),
  baseUrl: z.string().url(),
  secretArn: z.string().min(1).optional(),
});

export const createJobSchema = z.object({
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
    referenceTemplateUrl: z.string().url().optional(),
  }).default({}),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type JobStatus = "queued" | "crawling" | "importing" | "completed" | "failed" | "cancelled";

export interface MigrationPage {
  sourceUrl: string;
  destinationPath: string;
  title: string;
  html: string;
  assets: string[];
  links: string[];
}

export interface MigrationManifest {
  version: "1.0";
  sourceUrl: string;
  generatedAt: string;
  pages: MigrationPage[];
}

export interface MigrationJob extends CreateJobInput {
  id: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
  result?: unknown;
}
