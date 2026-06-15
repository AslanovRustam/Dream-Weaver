export type Quality = "low" | "medium" | "high";

const OPTIONS: { value: Quality; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function QualityPicker({
  value,
  onChange,
}: {
  value: Quality;
  onChange: (v: Quality) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-background p-0.5">
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition ${
              active ? "bg-accent-green text-black" : "text-foreground/70 hover:text-foreground"
            }`}
            title={
              o.value === "high"
                ? "High может не успеть за лимит сервера (~60с) — возможен таймаут"
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
