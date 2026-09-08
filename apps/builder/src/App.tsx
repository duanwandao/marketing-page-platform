import { BrowserRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./editor/EditorPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
