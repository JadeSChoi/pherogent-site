import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import "./field.css";

type FieldChrome = {
  label: string;
  error?: string;
  hint?: string;
};

function FieldShell({
  id,
  label,
  error,
  hint,
  errorId,
  children,
}: FieldChrome & { id: string; errorId: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="ui-field-hint">{hint}</p>}
      {error && (
        <p className="ui-field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

function fieldAria(error: string | undefined, errorId: string) {
  return error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};
}

type TextInputProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function TextInput({ label, error, hint, ...rest }: TextInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} errorId={errorId}>
      <input
        id={id}
        className="ui-input"
        {...fieldAria(error, errorId)}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">;

export function Select({ label, error, hint, children, ...rest }: SelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} errorId={errorId}>
      <select
        id={id}
        className="ui-input ui-select"
        {...fieldAria(error, errorId)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
