import type { FieldProps } from "./field-props";

export function ColorField({ field, value, onChange }: FieldProps) {
  const color = typeof value === "string" ? value : "#ffffff";

  return (
    <label className="field field--color">
      <span>{field.label}</span>
      <input type="color" value={color} onChange={(event) => onChange(event.target.value)} />
      <input type="text" value={color} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
