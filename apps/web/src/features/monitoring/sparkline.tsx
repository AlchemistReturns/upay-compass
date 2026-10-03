import type { Status } from "@compass/shared";
import { cn } from "@/lib/utils";

const STROKE: Record<Status, string> = {
  ok: "text-positive",
  watch: "text-warning-ink",
  problem: "text-destructive",
  unknown: "text-muted-foreground",
};

const W = 120;
const H = 36;
const PAD = 3;

/** A round dot that stays round when the chart stretches: a zero-length line with round caps. */
function Dot({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <path
      d={`M${x.toFixed(1)} ${y.toFixed(1)}h0`}
      stroke="currentColor"
      strokeWidth={size}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/**
 * A tiny trend line. Gaps (no requests in that hour) break the line instead of drawing a zero.
 * The caller gives the sentence a screen reader hears; the numbers are in the details table.
 */
export function Sparkline({
  values,
  status,
  label,
  className,
}: {
  values: readonly (number | null)[];
  status: Status;
  label: string;
  className?: string;
}) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return null;

  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  // split into runs at the gaps
  const runs: [number, number][][] = [];
  values.forEach((v, i) => {
    if (v === null) return runs.push([]);
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]!.push([x(i), y(v)]);
  });
  const drawn = runs.filter((r) => r.length > 0);
  const last = [...values]
    .map((v, i) => [v, i] as const)
    .filter(([v]) => v !== null)
    .at(-1)!;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      className={cn("h-9 w-full overflow-visible", STROKE[status], className)}
    >
      {drawn.map((run, i) =>
        run.length === 1 ? (
          <Dot key={i} x={run[0]![0]} y={run[0]![1]} size={4} />
        ) : (
          <path
            key={i}
            d={run
              .map(([px, py], j) => `${j === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
      <Dot x={x(last[1])} y={y(last[0]!)} size={7} />
    </svg>
  );
}
