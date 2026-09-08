import type { ConfigField } from "@mpp/component-core";
import { ColorField } from "./fields/ColorField";
import { ImageField } from "./fields/ImageField";
import { NumberField } from "./fields/NumberField";
import { SwitchField } from "./fields/SwitchField";
import { TextField } from "./fields/TextField";

export interface FieldRendererProps {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  switch (field.type) {
    case "number":
      return <NumberField field={field} value={value} onChange={onChange} />;
    case "image":
      return <ImageField field={field} value={value} onChange={onChange} />;
    case "color":
      return <ColorField field={field} value={value} onChange={onChange} />;
    case "switch":
      return <SwitchField field={field} value={value} onChange={onChange} />;
    case "text":
    default:
      return <TextField field={field} value={value} onChange={onChange} />;
  }
}
