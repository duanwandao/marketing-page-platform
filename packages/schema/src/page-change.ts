export interface UpdateComponentChange {
  operation: "update_component";
  componentId: string;
  props: Record<string, unknown>;
}

export interface AddComponentChange {
  operation: "add_component";
  component: { type: string; props?: Record<string, unknown> };
  beforeComponentId?: string;
}

export interface RemoveComponentChange {
  operation: "remove_component";
  componentId: string;
}

export type PageChange = UpdateComponentChange | AddComponentChange | RemoveComponentChange;
