import type { FieldProps } from "./field-props";

export function TextField({ field, value, onChange }: FieldProps) {
  return (
    <label className="field">
      <span>{field.label}</span>
      <input type="text" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
