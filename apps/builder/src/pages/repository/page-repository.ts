import type { CreatePageInput, PageRecord, UpdatePageInput } from "../page-record";

export interface PageRepository {
  list(): Promise<PageRecord[]>;
  get(id: string): Promise<PageRecord | null>;
  create(input: CreatePageInput): Promise<PageRecord>;
  update(id: string, patch: UpdatePageInput): Promise<PageRecord>;
  delete(id: string): Promise<void>;
}
