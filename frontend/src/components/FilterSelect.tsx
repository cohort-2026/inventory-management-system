import { SelectHTMLAttributes } from "react";
import "../App.css";

type FilterSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: { value: string; label: string }[];
};

export default function FilterSelect({ label, options, ...props }: FilterSelectProps) {
  return (
    <select className="filter-select" aria-label={label} defaultValue="" {...props}>
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}