import type { PageSchema } from "@mpp/schema";
import { ComponentRenderer } from "./ComponentRenderer";

export interface PageRendererProps {
  schema: PageSchema;
}

export function PageRenderer({ schema }: PageRendererProps) {
  return (
    <main className="mpp-page-renderer" aria-label={schema.title}>
      {schema.components.map((component) => (
        <ComponentRenderer component={component} key={component.id} />
      ))}
    </main>
  );
}
