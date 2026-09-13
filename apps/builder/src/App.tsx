import { BrowserRouter, Route, Routes } from "react-router-dom";
import { pageRepository } from "./app/page-repository";
import { EditorPage } from "./editor/EditorPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PageListPage } from "./pages/PageListPage";
import { PublishedPage } from "./pages/PublishedPage";
import type { PageRepository } from "./pages/repository/page-repository";

interface AppProps {
  repository?: PageRepository;
}

export function App({ repository = pageRepository }: AppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PageListPage repository={repository} />} />
        <Route path="/builder/:pageId" element={<EditorPage repository={repository} />} />
        <Route path="/pages/:pageId" element={<PublishedPage repository={repository} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
