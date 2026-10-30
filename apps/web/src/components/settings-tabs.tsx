"use client";

export function SettingsTabs({
  id,
  label,
  tabs,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  tabs: readonly (readonly [string, string])[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-tabs" role="tablist" aria-label={label}>
      {tabs.map(([key, title], index) => (
        <button
          type="button"
          role="tab"
          id={`${id}-tab-${key}`}
          key={key}
          aria-controls={`${id}-panel-${key}`}
          aria-selected={value === key}
          tabIndex={value === key ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(key)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft")
              next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            onChange(tabs[next][0]);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              );
            buttons?.[next]?.focus();
          }}
        >
          {title}
        </button>
      ))}
    </div>
  );
}
