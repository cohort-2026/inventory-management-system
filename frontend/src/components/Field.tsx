import type { InputHTMLAttributes } from "react";
import "../App.css";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export default function Field({ label, error, hint, id, ...props }: FieldProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">{label}</label>
      <input id={inputId} className="field-input" {...props} />
      {error && <p className="field-error">{error}</p>}
      {!error && hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}