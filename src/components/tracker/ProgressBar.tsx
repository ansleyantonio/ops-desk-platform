interface Props {
  value: number;
  label?: string;
  tone?: "primary" | "success" | "info";
}

export function ProgressBar({ value, label, tone = "primary" }: Props) {
  const toneClass = tone === "success" ? "bg-success" : tone === "info" ? "bg-info" : "bg-primary";
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-foreground tabular-nums">{value}%</span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/80">
        <div
          className={`h-full rounded-full ${toneClass} shadow-sm transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
