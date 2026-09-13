import type { PageSchema } from "@mpp/schema";

export type PageStatus = "draft" | "published";

export interface PageRecord {
  id: string;
  title: string;
  schema: PageSchema;
  publishedSchema: PageSchema | null;
  status: PageStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface CreatePageInput {
  title: string;
}

export interface UpdatePageInput {
  title?: string;
  schema?: PageSchema;
  publishedSchema?: PageSchema | null;
  status?: PageStatus;
}
