import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

export default function SearchInput(
  props: InputHTMLAttributes<HTMLInputElement>
) {
  return (
    <div className="search-input">
      <Search size={17} strokeWidth={1.8} />

      <input
        type="text"
        placeholder="Search..."
        aria-label="Search"
        {...props}
      />
    </div>
  );
}