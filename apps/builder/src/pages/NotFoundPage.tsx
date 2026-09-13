import { Link } from "react-router-dom";
import "./runtime.css";

export function NotFoundPage() {
  return (
    <main className="runtime-message">
      <h1>Page not found</h1>
      <Link to="/">Back to pages</Link>
    </main>
  );
}
