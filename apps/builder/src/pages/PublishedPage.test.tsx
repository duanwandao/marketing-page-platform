import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import { LocalStoragePageRepository } from "./repository/local-storage-page-repository";
import { PublishedPage } from "./PublishedPage";

afterEach(cleanup);

function renderPublishedPage(repository: LocalStoragePageRepository) {
  render(
    <MemoryRouter initialEntries={["/pages/page-1"]}>
      <Routes>
        <Route path="/pages/:pageId" element={<PublishedPage repository={repository} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PublishedPage", () => {
  beforeEach(() => {
    componentRegistry.clear();
    componentRegistry.register({
      type: "Message",
      name: "Message",
      component: ({ content }) => <div>{String(content)}</div>,
      defaultProps: { content: "" },
      configSchema: []
    });
  });

  it("does not render a draft page", async () => {
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    localStorage.clear();
    await repository.create({ title: "Draft" });

    renderPublishedPage(repository);

    expect(await screen.findByText("This page is not published.")).toBeInTheDocument();
  });

  it("renders the published snapshot instead of a newer draft", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Page" });
    const publishedSchema = {
      schemaVersion: 1 as const,
      id: "page-1",
      title: "Page",
      components: [{ id: "message-1", type: "Message", props: { content: "Published A" } }]
    };
    await repository.update("page-1", {
      schema: publishedSchema,
      publishedSchema,
      status: "published"
    });
    await repository.update("page-1", {
      schema: {
        ...publishedSchema,
        components: [{ id: "message-1", type: "Message", props: { content: "Draft B" } }]
      }
    });

    renderPublishedPage(repository);

    expect(await screen.findByText("Published A")).toBeInTheDocument();
    expect(screen.queryByText("Draft B")).not.toBeInTheDocument();
  });
});
