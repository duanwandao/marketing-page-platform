import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStoragePageRepository } from "./repository/local-storage-page-repository";
import { PageListPage } from "./PageListPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PageListPage", () => {
  it("shows the empty state, creates a page, and opens its editor", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<PageListPage repository={repository} />} />
          <Route path="/builder/:pageId" element={<div>Editor destination</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("No pages yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New page title"), { target: { value: "Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: "Create page" }));

    expect(await screen.findByText("Editor destination")).toBeInTheDocument();
    expect((await repository.get("page-1"))?.title).toBe("Campaign");
  });

  it("does not delete when browser confirmation is cancelled", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Campaign" });
    const deletePage = vi.spyOn(repository, "delete");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MemoryRouter>
        <PageListPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Campaign")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Campaign" }));

    expect(deletePage).not.toHaveBeenCalled();
    expect(screen.getByText("Campaign")).toBeInTheDocument();
  });

  it("deletes an existing page after browser confirmation", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Campaign" });
    const deletePage = vi.spyOn(repository, "delete");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MemoryRouter>
        <PageListPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Campaign" }));

    await waitFor(() => expect(screen.getByText("No pages yet.")).toBeInTheDocument());
    expect(deletePage).toHaveBeenCalledWith("page-1");
    expect(await repository.list()).toEqual([]);
  });
});
