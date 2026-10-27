import type { SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export default function SelectField({
  label,
  options,
  placeholder,
  id,
  ...props
}: SelectFieldProps) {
  const selectId = id || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="field">
      <label htmlFor={selectId} className="field-label">{label}</label>
      <select id={selectId} className="field-select" defaultValue="" {...props}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}