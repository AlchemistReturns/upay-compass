"use client";

import { useId, useRef, useState } from "react";
import { ChartToggle } from "@/features/transactions/chart-toggle";
import { cn } from "@/lib/utils";

const CELL = "px-3 py-2.5 text-start tabular-nums";

/** A Grafana-style panel: title, one-line subtitle, the chart, and a switch to its table. */
export function Panel({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** when given, a button flips the chart to this table */
  table?: { head: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("finance-card rise flex flex-col gap-3 p-4 sm:p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-bold">
            {title}
          </h3>
          {subtitle && <p className="text-muted-foreground mt-0.5 text-xs leading-5">{subtitle}</p>}
        </div>
        {table && <ChartToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />}
      </div>
      {asTable && table ? (
        <div className="max-h-72 overflow-auto rounded-2xl">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted text-muted-foreground sticky top-0 text-xs">
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col" className={CELL}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-hairline border-t">
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className={`${CELL} font-medium`}>
                        {cell}
                      </th>
                    ) : (
                      <td key={j} className={CELL}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

const W = 320;
const H = 130;

/**
 * Time series with horizontal grid lines, a labelled y axis, an optional dashed threshold, and a
 * hover (or touch) read-out. Gaps in the data break the line. The same numbers are in the table.
 */
export function LineChart({
  values,
  labels,
  format,
  tone = "text-primary",
  threshold,
  max,
  label,
}: {
  values: readonly (number | null)[];
  labels: readonly string[];
  format: (n: number) => string;
  tone?: string;
  threshold?: { value: number; text: string };
  /** fixed top of the y axis (e.g. 100 for percentages); otherwise fitted to the data */
  max?: number;
  label: string;
}) {
  const gid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const real = values.filter((v): v is number => v !== null);
  const top = max ?? Math.max(1e-9, ...real, threshold?.value ?? 0) * 1.15;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * W;
  const y = (v: number) => H - (Math.min(v, top) / top) * H;

  const runs: [number, number][][] = [];
  values.forEach((v, i) => {
    if (v === null) return runs.push([]);
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]!.push([x(i), y(v)]);
  });
  const lines = runs.filter((r) => r.length > 1);
  const path = (r: [number, number][]) =>
    r.map(([px, py], j) => `${j ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");

  function move(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r || values.length === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(ratio * (values.length - 1)));
  }

  const ticks = [0, 0.5, 1];
  const hv = hover !== null ? values[hover] : null;

  return (
    <div className={cn("relative ps-12 pb-6", tone)}>
      <div
        ref={box}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
        className="relative h-32 touch-pan-y"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          className="absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line
              key={t}
              x1="0"
              x2={W}
              y1={H - t * H}
              y2={H - t * H}
              className="stroke-hairline"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {threshold && (
            <line
              x1="0"
              x2={W}
              y1={y(threshold.value)}
              y2={y(threshold.value)}
              className="stroke-muted-foreground"
              strokeDasharray="4 4"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {lines.map((r, i) => (
            <g key={i}>
              <path
                d={`${path(r)} L${r[r.length - 1]![0]} ${H} L${r[0]![0]} ${H} Z`}
                fill={`url(#${gid})`}
              />
              <path
                d={path(r)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {hover !== null && hv !== null && hv !== undefined && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="0"
                y2={H}
                className="stroke-muted-foreground"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M${x(hover)} ${y(hv)}h0`}
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* y axis, in HTML so the text is never stretched */}
        <div
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-y-0 -start-12 w-11 text-end text-[10.5px] tabular-nums"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute end-0 -translate-y-1/2 leading-none"
              style={{ top: `${(1 - t) * 100}%` }}
            >
              {format(top * t)}
            </span>
          ))}
        </div>

        {threshold && (
          <span
            className="bg-card text-muted-foreground pointer-events-none absolute end-0 -translate-y-full rounded px-1 text-[10.5px]"
            style={{ top: `${(1 - Math.min(threshold.value, top) / top) * 100}%` }}
          >
            {threshold.text}
          </span>
        )}

        {hover !== null && (
          <div
            role="status"
            className="glass pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-xl px-2.5 py-1.5 text-xs whitespace-nowrap text-foreground"
            style={{
              left: `${(hover / Math.max(1, values.length - 1)) * 100}%`,
              translate:
                hover > values.length * 0.7
                  ? "-100% 0"
                  : hover < values.length * 0.15
                    ? "0 0"
                    : "-50% 0",
            }}
          >
            <span className="text-muted-foreground">{labels[hover]}</span>{" "}
            <strong className="tabular-nums">
              {hv === null || hv === undefined ? "–" : format(hv)}
            </strong>
          </div>
        )}
      </div>

      <div
        aria-hidden
        className="text-muted-foreground absolute inset-x-0 bottom-0 ps-12 text-[10.5px]"
      >
        <div className="flex justify-between">
          <span>{labels[0]}</span>
          <span>{labels[Math.floor((labels.length - 1) / 2)]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      </div>
    </div>
  );
}

export type StackSeries = { key: string; className: string; values: number[] };

/** Stacked columns (answered, backup, failed) with a legend that names each colour. */
export function StackedBars({
  series,
  labels,
  legend,
  label,
}: {
  series: StackSeries[];
  labels: readonly string[];
  legend: { className: string; text: string }[];
  label: string;
}) {
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const peak = Math.max(1, ...totals);
  const slot = W / Math.max(1, n);
  return (
    <div>
      <div className="relative ps-12 pb-6">
        <div className="relative h-32">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={label}
            className="absolute inset-0 size-full"
          >
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1="0"
                x2={W}
                y1={H - t * H}
                y2={H - t * H}
                className="stroke-hairline"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {labels.map((l, i) => {
              let acc = 0;
              return (
                <g key={l + i}>
                  {series.map((s) => {
                    const h = ((s.values[i] ?? 0) / peak) * H;
                    acc += h;
                    return (
                      <rect
                        key={s.key}
                        x={i * slot + slot * 0.14}
                        y={H - acc}
                        width={slot * 0.72}
                        height={h}
                        className={s.className}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-y-0 -start-12 w-11 text-end text-[10.5px] tabular-nums"
          >
            {[0, 0.5, 1].map((t) => (
              <span
                key={t}
                className="absolute end-0 -translate-y-1/2 leading-none"
                style={{ top: `${(1 - t) * 100}%` }}
              >
                {Math.round(peak * t)}
              </span>
            ))}
          </div>
        </div>
        <div
          aria-hidden
          className="text-muted-foreground absolute inset-x-0 bottom-0 flex justify-between ps-12 text-[10.5px]"
        >
          <span>{labels[0]}</span>
          <span>{labels[Math.floor((n - 1) / 2)]}</span>
          <span>{labels[n - 1]}</span>
        </div>
      </div>
      <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {legend.map((l) => (
          <li key={l.text} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-sm", l.className)} />
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars, one row per item; each row can carry an extra figure on the right. */
export function BarRows({
  rows,
}: {
  rows: { name: string; value: number; valueText: string; extra?: string; bad?: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {r.valueText}
              {r.extra ? ` · ${r.extra}` : ""}
            </span>
          </div>
          <div className="bg-muted mt-1.5 flex h-2.5 overflow-hidden rounded-full">
            <span
              className="bg-primary/75 h-full"
              style={{ width: `${((r.value - (r.bad ?? 0)) / max) * 100}%` }}
            />
            {(r.bad ?? 0) > 0 && (
              <span
                className="h-full bg-[#f4b24c]"
                style={{ width: `${((r.bad ?? 0) / max) * 100}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into labelled parts that add to 100%, with a legend that states each share. */
export function MixBar({
  parts,
  label,
}: {
  parts: { text: string; pct: number; className: string }[];
  label: string;
}) {
  return (
    <div>
      <div role="img" aria-label={label} className="bg-muted flex h-4 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.text} className={cn("h-full", p.className)} style={{ width: `${p.pct}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.text} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", p.className)} />
            <span className="text-muted-foreground">{p.text}</span>
            <strong className="ms-auto tabular-nums">{Math.round(p.pct)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
