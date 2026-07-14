type Props = {
  ratios: string[];
  value: string;
  onChange: (r: string) => void;
};

function parseRatio(r: string): [number, number] {
  const [a, b] = r.split(":").map(Number);
  return [a, b];
}

export function AspectRatioPicker({ ratios, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {ratios.map((r) => {
        const [w, h] = parseRatio(r);
        const maxDim = 18;
        const scale = maxDim / Math.max(w, h);
        const boxW = w * scale;
        const boxH = h * scale;
        const selected = value === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={`flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-all ${
              selected
                ? "border-accent-green bg-accent-green text-black"
                : "border-border bg-card text-foreground hover:border-foreground/40"
            }`}
          >
            <span
              className={`block border ${selected ? "border-black" : "border-foreground/60"}`}
              style={{ width: `${boxW}px`, height: `${boxH}px` }}
            />
            {r}
          </button>
        );
      })}
    </div>
  );
}
