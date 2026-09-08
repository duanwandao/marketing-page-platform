import type { FieldProps } from "./field-props";

export function SwitchField({ field, value, onChange }: FieldProps) {
  return (
    <label className="field field--switch">
      <span>{field.label}</span>
      <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
