import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStoragePageRepository } from "./repository/local-storage-page-repository";
import { PageListPage } from "./PageListPage";

afterEach(cleanup);

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

  it("lists and deletes an existing page", async () => {
    localStorage.clear();
    const repository = new LocalStoragePageRepository(localStorage, { createId: () => "page-1" });
    await repository.create({ title: "Campaign" });
    render(
      <MemoryRouter>
        <PageListPage repository={repository} />
      </MemoryRouter>
    );

    expect(await screen.findByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Campaign" }));

    await waitFor(() => expect(screen.getByText("No pages yet.")).toBeInTheDocument());
    expect(await repository.list()).toEqual([]);
  });
});
