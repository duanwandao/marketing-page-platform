import { createEmptyPageSchema, type ComponentSchema, type PageSchema } from "@mpp/schema";
import type { PageRecord, PageStatus, CreatePageInput, UpdatePageInput } from "../page-record";
import type { PageRepository } from "./page-repository";

const STORAGE_KEY = "mpp.pages.v1";

interface RepositoryOptions {
  createId?: () => string;
  now?: () => string;
}

export class PageRepositoryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRepositoryDataError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComponentSchema(value: unknown): value is ComponentSchema {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isObject(value.props)
  );
}

function isPageSchema(value: unknown): value is PageSchema {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.components) &&
    value.components.every(isComponentSchema)
  );
}

function isPageStatus(value: unknown): value is PageStatus {
  return value === "draft" || value === "published";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPageRecord(value: unknown): value is PageRecord {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !isPageSchema(value.schema) ||
    !(value.publishedSchema === null || isPageSchema(value.publishedSchema)) ||
    !isPageStatus(value.status) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isNullableString(value.publishedAt)
  ) {
    return false;
  }

  if (value.id !== value.schema.id || value.title !== value.schema.title) {
    return false;
  }

  if (value.publishedSchema !== null && value.publishedSchema.id !== value.id) {
    return false;
  }

  return value.status !== "published" || value.publishedSchema !== null;
}

function schemasEqual(left: PageSchema, right: PageSchema): boolean {
  if (
    left.schemaVersion !== right.schemaVersion ||
    left.id !== right.id ||
    left.title !== right.title ||
    left.components.length !== right.components.length
  ) {
    return false;
  }

  return left.components.every((component, index) => {
    const other = right.components[index];
    return (
      component.id === other.id &&
      component.type === other.type &&
      JSON.stringify(component.props) === JSON.stringify(other.props)
    );
  });
}

function normalizeSchema(schema: PageSchema, id: string, title: string): PageSchema {
  return structuredClone({ ...schema, id, title });
}

export class LocalStoragePageRepository implements PageRepository {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly storage: Storage = window.localStorage,
    options: RepositoryOptions = {}
  ) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async list(): Promise<PageRecord[]> {
    return this.readAll()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((page) => structuredClone(page));
  }

  async get(id: string): Promise<PageRecord | null> {
    const page = this.readAll().find((candidate) => candidate.id === id);
    return page ? structuredClone(page) : null;
  }

  async create(input: CreatePageInput): Promise<PageRecord> {
    const pages = this.readAll();
    const id = this.createId();
    if (pages.some((page) => page.id === id)) {
      throw new Error(`Page already exists: ${id}`);
    }

    const timestamp = this.now();
    const page: PageRecord = {
      id,
      title: input.title,
      schema: createEmptyPageSchema({ id, title: input.title }),
      publishedSchema: null,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: null
    };
    this.writeAll([...pages, page]);
    return structuredClone(page);
  }

  async update(id: string, patch: UpdatePageInput): Promise<PageRecord> {
    const pages = this.readAll();
    const index = pages.findIndex((page) => page.id === id);
    if (index < 0) {
      throw new Error(`Page not found: ${id}`);
    }

    const current = pages[index];
    const title = patch.title ?? current.title;
    const schema = normalizeSchema(patch.schema ?? current.schema, id, title);
    const hasPublishedSchema = Object.prototype.hasOwnProperty.call(patch, "publishedSchema");
    const publishedSchema = hasPublishedSchema
      ? patch.publishedSchema == null
        ? null
        : normalizeSchema(patch.publishedSchema, id, title)
      : current.publishedSchema;
    const status = patch.status ?? current.status;

    if (hasPublishedSchema && patch.status !== "published") {
      throw new Error("Published schema can only be changed by publishing");
    }

    if (status === "published" && publishedSchema === null) {
      throw new Error("A published page requires a published schema");
    }

    if (hasPublishedSchema && publishedSchema !== null && !schemasEqual(schema, publishedSchema)) {
      throw new Error("Published schema must match the saved draft");
    }

    const timestamp = this.now();
    const updated: PageRecord = {
      ...current,
      title,
      schema,
      publishedSchema,
      status,
      updatedAt: timestamp,
      publishedAt:
        status === "published" && hasPublishedSchema
          ? timestamp
          : current.publishedAt
    };
    pages[index] = updated;
    this.writeAll(pages);
    return structuredClone(updated);
  }

  async delete(id: string): Promise<void> {
    const pages = this.readAll();
    this.writeAll(pages.filter((page) => page.id !== id));
  }

  private readAll(): PageRecord[] {
    const serialized = this.storage.getItem(STORAGE_KEY);
    if (serialized === null) {
      return [];
    }

    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new PageRepositoryDataError("Stored page data is not valid JSON");
    }

    if (!Array.isArray(value) || !value.every(isPageRecord)) {
      throw new PageRepositoryDataError("Stored page data has an invalid structure");
    }

    return structuredClone(value);
  }

  private writeAll(pages: PageRecord[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(pages));
  }
}
