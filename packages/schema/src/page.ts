import type { ComponentSchema } from "./component";

export interface PageSchema {
  schemaVersion: 1;
  id: string;
  title: string;
  components: ComponentSchema[];
}

export interface CreateEmptyPageSchemaInput {
  id: string;
  title: string;
}

export function createEmptyPageSchema(input: CreateEmptyPageSchemaInput): PageSchema {
  return {
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    components: []
  };
}
