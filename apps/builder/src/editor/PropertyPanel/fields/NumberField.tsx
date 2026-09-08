import type { FieldProps } from "./field-props";

export function NumberField({ field, value, onChange }: FieldProps) {
  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        type="number"
        value={typeof value === "number" ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
