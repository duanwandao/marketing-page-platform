import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PageRecord } from "./page-record";
import type { PageRepository } from "./repository/page-repository";
import "./page-list.css";

interface PageListPageProps {
  repository: PageRepository;
}

export function PageListPage({ repository }: PageListPageProps) {
  const navigate = useNavigate();
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository
      .list()
      .then((records) => {
        if (active) setPages(records);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load pages.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository]);

  async function createPage(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || busy) return;

    setBusy(true);
    setError(null);
    try {
      const page = await repository.create({ title: nextTitle });
      navigate(`/builder/${page.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the page.");
      setBusy(false);
    }
  }

  async function deletePage(page: PageRecord) {
    if (busy) return;
    if (!window.confirm(`Delete "${page.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await repository.delete(page.id);
      setPages((current) => current.filter((candidate) => candidate.id !== page.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-list-shell">
      <header className="page-list-header">
        <div>
          <p className="eyebrow">Marketing Page Platform</p>
          <h1>Pages</h1>
        </div>
        <form className="create-page-form" onSubmit={createPage}>
          <label>
            <span>New page title</span>
            <input
              aria-label="New page title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Mid-autumn campaign"
              value={title}
            />
          </label>
          <button disabled={busy || title.trim().length === 0} type="submit">
            Create page
          </button>
        </form>
      </header>

      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading ? (
        <p className="notice">Loading pages…</p>
      ) : pages.length === 0 ? (
        <section className="empty-state">No pages yet.</section>
      ) : (
        <section className="page-list" aria-label="Pages">
          {pages.map((page) => (
            <article className="page-list-item" key={page.id}>
              <div>
                <Link to={`/builder/${page.id}`}>{page.title}</Link>
                <p>Updated {new Date(page.updatedAt).toLocaleString()}</p>
              </div>
              <span className={`status-badge status-badge--${page.status}`}>{page.status}</span>
              <button
                aria-label={`Delete ${page.title}`}
                disabled={busy}
                onClick={() => void deletePage(page)}
                type="button"
              >
                Delete
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
