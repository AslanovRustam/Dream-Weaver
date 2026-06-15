type Props = {
  value: string;
  onChange: (id: string) => void;
};

const PRESETS = ["preset1", "preset2", "preset3", "preset4"];

export function PresetGrid({ value, onChange }: Props) {
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-3">
      {PRESETS.map((id, i) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex items-center justify-center rounded-xl border text-sm font-medium transition-all ${
              selected
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border bg-card text-foreground hover:border-foreground/40"
            }`}
          >
            Preset{i + 1}
          </button>
        );
      })}
    </div>
  );
}
