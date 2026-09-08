import type { ConfigField } from "@mpp/component-core";

export interface FieldProps {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}
