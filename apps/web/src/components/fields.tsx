"use client";
import { useState, type ReactNode } from "react";
export function SaveForm({
  initial,
  onSave,
  children,
  label = "标题",
}: {
  initial: string;
  onSave: (v: string) => Promise<void>;
  children?: ReactNode;
  label?: string;
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
      <label className="field">
        {label}
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
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
}: {
  label: string;
  value: string | number;
  onChange: (s: string) => void;
  multiline?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          disabled={disabled}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </label>
  );
}
