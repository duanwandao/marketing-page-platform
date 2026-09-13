import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageRenderer } from "@mpp/renderer";
import type { PageRecord } from "./page-record";
import type { PageRepository } from "./repository/page-repository";
import "./runtime.css";

interface PublishedPageProps {
  repository: PageRepository;
}

export function PublishedPage({ repository }: PublishedPageProps) {
  const { pageId } = useParams();
  const [page, setPage] = useState<PageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    if (!pageId) {
      setLoading(false);
      return;
    }

    repository
      .get(pageId)
      .then((record) => {
        if (active) setPage(record);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pageId, repository]);

  if (loading) return <main className="runtime-message">Loading page…</main>;
  if (error) return <main className="runtime-message runtime-message--error">{error}</main>;
  if (!page || page.status !== "published" || page.publishedSchema === null) {
    return <main className="runtime-message">This page is not published.</main>;
  }

  return <PageRenderer schema={page.publishedSchema} />;
}
