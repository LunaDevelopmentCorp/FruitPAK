import { InputHTMLAttributes, forwardRef } from "react";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onChange: (value: number) => void;
};

/**
 * Number input that shows an empty field instead of "0".
 * Prevents the common UX issue where a pre-filled zero causes
 * mis-entry (e.g. typing "110" but getting "0110" or "1100").
 */
const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, ...props }, ref) => (
    <input
      ref={ref}
      type="number"
      value={value || ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
      {...props}
    />
  )
);

NumberInput.displayName = "NumberInput";

export default NumberInput;
