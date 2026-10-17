import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { componentRegistry } from "@mpp/component-registry";
import type { UpdatePageInput } from "../pages/page-record";
import type { PageRepository } from "../pages/repository/page-repository";
import { LocalStoragePageRepository } from "../pages/repository/local-storage-page-repository";
import { EditorPage } from "./EditorPage";

afterEach(cleanup);

beforeEach(() => {
  componentRegistry.clear();
  componentRegistry.register({
    type: "Demo",
    name: "Demo",
    component: () => null,
    defaultProps: {},
    configSchema: []
  });
});

function renderEditor(repository: PageRepository) {
  render(
    <MemoryRouter initialEntries={["/builder/page-1"]}>
      <Routes>
        <Route path="/builder/:pageId" element={<EditorPage repository={repository} />} />
      </Routes>
    </MemoryRouter>
  );
}

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/builder/page-2")} type="button">Open page B</button>
      <Outlet />
    </>
  );
}

describe("EditorPage", () => {
  it("loads the route page and saves a changed title as a clean draft", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Original" });

    renderEditor(repository);
    const title = await screen.findByLabelText("Page title");
    expect(title).toHaveValue("Original");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(title, { target: { value: "Renamed" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect((await repository.get("page-1"))?.title).toBe("Renamed");
  });

  it("enables Save when adding a component changes the draft", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Original" });

    renderEditor(repository);
    await screen.findByLabelText("Page title");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Demo" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("publishes the current draft without requiring a prior save", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Original" });

    renderEditor(repository);
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "Published title" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(async () => {
      const page = await repository.get("page-1");
      expect(page?.status).toBe("published");
      expect(page?.schema.title).toBe("Published title");
      expect(page?.publishedSchema?.title).toBe("Published title");
      expect(page?.publishedAt).not.toBeNull();
    });
  });

  it("keeps the editor workspace available through the narrow-screen drawer control", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Workspace" });
    renderEditor(repository);
    await screen.findByLabelText("Page title");

    const sidebar = screen.getByRole("complementary", { name: "Editor workspace" });
    expect(sidebar).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open assistant workspace" }));
    expect(document.querySelector(".editor-layout")).toHaveClass("editor-layout--workspace-open");
    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(document.querySelector(".editor-layout")).not.toHaveClass("editor-layout--workspace-open");
  });

  it("keeps the Copilot mounted when switching between Edit and Preview", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Persistent workspace" });
    renderEditor(repository);
    await screen.findByLabelText("Page title");
    const tab = screen.getByRole("tab", { name: "AI Copilot" });
    expect(tab).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "AI Copilot" }));
    expect(screen.getByLabelText("Describe the page or change you want")).toBeVisible();
  });

  it("keeps later edits dirty when an earlier save completes", async () => {
    localStorage.clear();
    const delegate = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await delegate.create({ title: "Original" });
    let releaseSave: (() => void) | undefined;
    const repository: PageRepository = {
      list: () => delegate.list(),
      get: (id) => delegate.get(id),
      create: (input) => delegate.create(input),
      delete: (id) => delegate.delete(id),
      update: async (id: string, patch: UpdatePageInput) => {
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
        return delegate.update(id, patch);
      }
    };

    renderEditor(repository);
    const title = await screen.findByLabelText("Page title");
    fireEvent.change(title, { target: { value: "First edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saving…")).toBeInTheDocument();

    fireEvent.change(title, { target: { value: "Second edit" } });
    releaseSave?.();

    await waitFor(() => expect(screen.getByText("Unsaved changes")).toBeInTheDocument());
  });

  it("ignores an older page save completion after navigating to another editor session", async () => {
    localStorage.clear();
    let nextId = 1;
    const delegate = new LocalStoragePageRepository(localStorage, {
      createId: () => `page-${nextId++}`
    });
    await delegate.create({ title: "Page A" });
    await delegate.create({ title: "Page B" });
    let releaseSave: (() => void) | undefined;
    const repository: PageRepository = {
      list: () => delegate.list(),
      get: (id) => delegate.get(id),
      create: (input) => delegate.create(input),
      delete: (id) => delegate.delete(id),
      update: async (id, patch) => {
        if (id === "page-1") {
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
        }
        return delegate.update(id, patch);
      }
    };
    render(
      <MemoryRouter initialEntries={["/builder/page-1"]}>
        <Routes>
          <Route element={<NavigationHarness />}>
            <Route path="/builder/:pageId" element={<EditorPage repository={repository} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const firstTitle = await screen.findByLabelText("Page title");
    fireEvent.change(firstTitle, { target: { value: "Page A edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saving…");

    fireEvent.click(screen.getByRole("button", { name: "Open page B" }));
    const secondTitle = await screen.findByDisplayValue("Page B");
    fireEvent.change(secondTitle, { target: { value: "Page B edit" } });
    releaseSave?.();

    await waitFor(() => expect(screen.getByDisplayValue("Page B edit")).toBeInTheDocument());
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
