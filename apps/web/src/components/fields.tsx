"use client";
import { useId, useState, type ReactNode } from "react";
export function FieldHelp({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p className="field-help" id={id}>
      {children}
    </p>
  );
}
export function SaveForm({
  initial,
  onSave,
  children,
  label = "标题",
  help,
}: {
  initial: string;
  onSave: (v: string) => Promise<void>;
  children?: ReactNode;
  label?: string;
  help?: string;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSave(value);
        } catch (e) {
          setError(e instanceof Error ? e.message : "保存失败，请稍后重试");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={label} value={value} onChange={setValue} help={help} />
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy} className="button">
        {busy ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  disabled = false,
  help,
}: {
  label: string;
  value: string | number;
  onChange: (s: string) => void;
  multiline?: boolean;
  type?: string;
  disabled?: boolean;
  help?: string;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          aria-describedby={helpId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          disabled={disabled}
        />
      ) : (
        <input
          id={id}
          aria-describedby={helpId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
      {help && <FieldHelp id={helpId}>{help}</FieldHelp>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  help,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      {help && <FieldHelp id={helpId}>{help}</FieldHelp>}
    </div>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  help,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className="check-field">
      <label className="check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {help && <FieldHelp id={helpId}>{help}</FieldHelp>}
    </div>
  );
}
