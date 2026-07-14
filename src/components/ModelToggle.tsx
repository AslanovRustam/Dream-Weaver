export type ModelKey = "gpt" | "nano";

type Props = {
  value: ModelKey;
  onChange: (m: ModelKey) => void;
};

export function ModelToggle({ value, onChange }: Props) {
  const options: { key: ModelKey; label: string }[] = [
    { key: "gpt", label: "Артистизм" },
    { key: "nano", label: "Реализм" },
  ];
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-1">
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              selected
                ? "bg-foreground text-background"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
