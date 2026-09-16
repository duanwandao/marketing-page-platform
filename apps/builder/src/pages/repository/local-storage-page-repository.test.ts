import { describe, expect, it } from "vitest";
import type { PageSchema } from "@mpp/schema";
import { LocalStoragePageRepository, PageRepositoryDataError } from "./local-storage-page-repository";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const firstTime = "2026-09-13T10:00:00.000Z";
const secondTime = "2026-09-13T11:00:00.000Z";

function createRepository(storage = new MemoryStorage()) {
  let now = firstTime;
  const repository = new LocalStoragePageRepository(storage, {
    createId: () => "page-1",
    now: () => now
  });

  return {
    repository,
    storage,
    advanceTime: () => {
      now = secondTime;
    }
  };
}

function schemaWithTitle(title: string): PageSchema {
  return {
    schemaVersion: 1,
    id: "page-1",
    title,
    components: [{ id: "text-1", type: "Text", props: { content: title } }]
  };
}

describe("LocalStoragePageRepository", () => {
  it("creates a draft page and gets an independent copy", async () => {
    const { repository } = createRepository();

    const created = await repository.create({ title: "Launch" });
    created.schema.title = "Mutated outside repository";
    const loaded = await repository.get("page-1");

    expect(loaded).toEqual({
      id: "page-1",
      title: "Launch",
      schema: {
        schemaVersion: 1,
        id: "page-1",
        title: "Launch",
        components: []
      },
      publishedSchema: null,
      status: "draft",
      createdAt: firstTime,
      updatedAt: firstTime,
      publishedAt: null
    });
  });

  it("updates title and draft schema while preserving record invariants", async () => {
    const { repository, advanceTime } = createRepository();
    await repository.create({ title: "Launch" });
    advanceTime();

    const updated = await repository.update("page-1", {
      title: "Autumn Launch",
      schema: schemaWithTitle("Ignored input title")
    });

    expect(updated.title).toBe("Autumn Launch");
    expect(updated.schema.id).toBe("page-1");
    expect(updated.schema.title).toBe("Autumn Launch");
    expect(updated.schema.components[0].props.content).toBe("Ignored input title");
    expect(updated.updatedAt).toBe(secondTime);
  });

  it("deletes a page", async () => {
    const { repository } = createRepository();
    await repository.create({ title: "Launch" });

    await repository.delete("page-1");

    expect(await repository.get("page-1")).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  it("reloads saved data from a new repository instance", async () => {
    const { repository, storage } = createRepository();
    await repository.create({ title: "Launch" });
    await repository.update("page-1", { schema: schemaWithTitle("Launch") });

    const reloadedRepository = new LocalStoragePageRepository(storage);

    expect((await reloadedRepository.get("page-1"))?.schema.components).toHaveLength(1);
  });

  it("keeps the published snapshot unchanged when a newer draft is saved", async () => {
    const { repository, advanceTime } = createRepository();
    await repository.create({ title: "A" });
    const schemaA = schemaWithTitle("A");
    await repository.update("page-1", {
      title: "A",
      schema: schemaA,
      publishedSchema: schemaA,
      status: "published"
    });

    advanceTime();
    const schemaB = schemaWithTitle("B");
    await repository.update("page-1", { title: "B", schema: schemaB });
    const afterSave = await repository.get("page-1");

    expect(afterSave?.schema.title).toBe("B");
    expect(afterSave?.publishedSchema?.title).toBe("A");
    expect(afterSave?.publishedAt).toBe(firstTime);

    await repository.update("page-1", {
      title: "B",
      schema: schemaB,
      publishedSchema: schemaB,
      status: "published"
    });
    const afterRepublish = await repository.get("page-1");

    expect(afterRepublish?.publishedSchema?.title).toBe("B");
    expect(afterRepublish?.publishedAt).toBe(secondTime);
    expect(afterRepublish?.status).toBe("published");
  });

  it("rejects a publish snapshot that differs from the draft saved in the same update", async () => {
    const { repository } = createRepository();
    await repository.create({ title: "A" });

    await expect(
      repository.update("page-1", {
        schema: schemaWithTitle("B"),
        publishedSchema: schemaWithTitle("A"),
        status: "published"
      })
    ).rejects.toThrow("Published schema must match the saved draft");
  });

  it("does not expose stored schema references through list or update results", async () => {
    const { repository } = createRepository();
    await repository.create({ title: "Launch" });
    const updated = await repository.update("page-1", { schema: schemaWithTitle("Launch") });
    updated.schema.components[0].props.content = "Changed";
    const [listed] = await repository.list();
    listed.schema.components[0].props.content = "Also changed";

    expect((await repository.get("page-1"))?.schema.components[0].props.content).toBe("Launch");
  });

  it("rejects malformed persisted data with a repository-specific error", async () => {
    const storage = new MemoryStorage();
    storage.setItem("mpp.pages.v1", JSON.stringify([{ id: "broken" }]));
    const repository = new LocalStoragePageRepository(storage);

    await expect(repository.list()).rejects.toBeInstanceOf(PageRepositoryDataError);
  });

  it("rejects persisted data whose published snapshot belongs to another page", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mpp.pages.v1",
      JSON.stringify([
        {
          id: "page-1",
          title: "A",
          schema: schemaWithTitle("A"),
          publishedSchema: { ...schemaWithTitle("A"), id: "page-2" },
          status: "published",
          createdAt: firstTime,
          updatedAt: firstTime,
          publishedAt: firstTime
        }
      ])
    );
    const repository = new LocalStoragePageRepository(storage);

    await expect(repository.list()).rejects.toBeInstanceOf(PageRepositoryDataError);
  });

  it("rejects a published record without a published timestamp", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mpp.pages.v1",
      JSON.stringify([
        {
          id: "page-1",
          title: "A",
          schema: schemaWithTitle("A"),
          publishedSchema: schemaWithTitle("A"),
          status: "published",
          createdAt: firstTime,
          updatedAt: firstTime,
          publishedAt: null
        }
      ])
    );
    const repository = new LocalStoragePageRepository(storage);

    await expect(repository.list()).rejects.toBeInstanceOf(PageRepositoryDataError);
  });

  it("rejects a draft record that has a published timestamp", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "mpp.pages.v1",
      JSON.stringify([
        {
          id: "page-1",
          title: "A",
          schema: schemaWithTitle("A"),
          publishedSchema: null,
          status: "draft",
          createdAt: firstTime,
          updatedAt: firstTime,
          publishedAt: firstTime
        }
      ])
    );
    const repository = new LocalStoragePageRepository(storage);

    await expect(repository.list()).rejects.toBeInstanceOf(PageRepositoryDataError);
  });
});
