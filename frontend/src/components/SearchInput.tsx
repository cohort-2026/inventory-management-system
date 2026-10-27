import type { InputHTMLAttributes } from "react";

export default function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="search-input">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <input type="text" placeholder="Search..." {...props} />
    </div>
  );
}