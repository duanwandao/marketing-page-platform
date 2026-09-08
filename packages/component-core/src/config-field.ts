export type ConfigFieldType = "text" | "number" | "image" | "color" | "switch";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
}
