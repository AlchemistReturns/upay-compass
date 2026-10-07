// Benchmarks the forecast methods on simulated people. Run: pnpm eval:forecast
//
// Methods: current heuristic (weekday medians), Holt-Winters, ridge (trained offline), and the
// per-person ensemble. Each person is forecast 30 days ahead from three cut-off days.
//
// EVAL_SPLITS (comma list, default "holdout,shifted"):
//   dev      people used while building the models; look at these freely
//   holdout  same kind of person as training, new seeds; the number to report
//   shifted  settings outside anything seen in training (amounts x0.3-0.5 or x2-3, noise, drops)
// Simulated data only.
import {
  FORECAST_RIDGE_WEIGHTS,
  addDays,
  backtestAll,
  defaultEnsemble,
  holtWintersPredictor,
  ridgeSpendPredictor,
} from "../../packages/shared/src/index.ts";
import { buildUser, makePopulation } from "../../adapters/upay-sim/src/index.ts";

const USERS = Number(process.env.EVAL_USERS ?? 90);
const SPLITS = (process.env.EVAL_SPLITS ?? "holdout,shifted").split(",");
const HORIZON = 30;
const CUTS_BACK = [30, 44, 58];

const ridge = ridgeSpendPredictor(FORECAST_RIDGE_WEIGHTS);
const methods = {
  heuristic: undefined,
  holt_winters: holtWintersPredictor,
  ridge: FORECAST_RIDGE_WEIGHTS ? ridge : null,
  ensemble: defaultEnsemble(FORECAST_RIDGE_WEIGHTS ? ridge : () => null),
};

const cuts = (user) => CUTS_BACK.map((n) => addDays(user.spec.endDay, -n));
const fmt = (n, d = 1) => n.toFixed(d);
const pct = (n) => `${(n * 100).toFixed(0)}%`;
const rel = (value, base) => (base === 0 ? 0 : (value - base) / base);
const change = (value, base) => {
  const r = rel(value, base) * 100;
  return `${r > 0 ? "+" : ""}${r.toFixed(0)}%`;
};
const quantile = (values, q) => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

const lines = [];
const out = (s = "") => lines.push(s);
const results = {};

for (const split of SPLITS) {
  const users = makePopulation(split, USERS).map((s) => {
    const u = buildUser(s);
    return { id: s.id, group: s.persona, txs: u.txs, openingBalance: u.openingBalance, spec: s };
  });
  out(
    `## ${split} people (${users.length}, ${CUTS_BACK.length} cut-offs each, ${HORIZON}-day horizon)`,
  );
  out();
  out(
    `| Method | Cases | Balance MAE (৳) | vs heuristic | Day-30 balance error (৳) | vs heuristic | Day-30 balance bias (৳) | Total spend bias | Daily spend MAE (৳) | Band coverage (target 80%) | Risk precision | Risk recall |`,
  );
  out(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
  const r = {};
  for (const [name, predictor] of Object.entries(methods)) {
    if (predictor === null) continue;
    r[name] = backtestAll(users, cuts, predictor, HORIZON);
    const o = r[name].overall;
    const b = r.heuristic.overall;
    const isBase = name === "heuristic";
    out(
      `| ${name} | ${o.cases} | ${fmt(o.balanceMae, 0)} | ${isBase ? "-" : change(o.balanceMae, b.balanceMae)} | ${fmt(o.endBalanceErr, 0)} | ${isBase ? "-" : change(o.endBalanceErr, b.endBalanceErr)} | ${o.endBalanceBias > 0 ? "+" : ""}${fmt(o.endBalanceBias, 0)} | ${o.spendBiasPct > 0 ? "+" : ""}${fmt(o.spendBiasPct, 0)}% | ${fmt(o.spendMae)} | ${o.bandCoverage === null ? "-" : pct(o.bandCoverage)} | ${pct(o.riskPrecision)} | ${pct(o.riskRecall)} |`,
    );
  }
  out();
  out(`By persona (balance MAE, ৳):`);
  out();
  const groups = Object.keys(r.heuristic.byGroup);
  out(`| Method | ${groups.join(" | ")} |`);
  out(`|---|${groups.map(() => "---").join("|")}|`);
  for (const [name, x] of Object.entries(r)) {
    out(`| ${name} | ${groups.map((g) => fmt(x.byGroup[g].balanceMae, 0)).join(" | ")} |`);
  }
  out();
  const ratios = r.ensemble.overall.bandRatios;
  out(
    `Band calibration (ensemble): coverage ${pct(r.ensemble.overall.bandCoverage ?? 0)}; the band would need to be ${fmt(quantile(ratios, 0.8), 2)}x wider to cover 80%.`,
  );
  out();
  results[split] = r;
}

// Ship rule (docs/ML_IMPLEMENTATION_PLAN.md, Phase 2). The forecast is used for the balance path,
// so the rule is on the balance error. Daily spend MAE is reported but is not the rule: it rewards
// guessing the median, which for lumpy spending guesses too low (see "Total spend bias").
const t = results.holdout;
const s = results.shifted;
if (t && s) {
  const gain = -rel(t.ensemble.overall.balanceMae, t.heuristic.overall.balanceMae);
  const endGain = -rel(t.ensemble.overall.endBalanceErr, t.heuristic.overall.endBalanceErr);
  const worstPersona = Math.max(
    ...Object.keys(t.heuristic.byGroup).map((g) =>
      rel(t.ensemble.byGroup[g].balanceMae, t.heuristic.byGroup[g].balanceMae),
    ),
  );
  const shiftedWorse = rel(s.ensemble.overall.balanceMae, s.heuristic.overall.balanceMae);
  const checks = [
    [`Balance MAE vs heuristic, holdout people: ${pct(-gain)} (needs -10% or better)`, gain >= 0.1],
    [
      `Day-30 balance error vs heuristic, holdout people: ${pct(-endGain)} (needs better than heuristic)`,
      endGain > 0,
    ],
    [
      `Worst persona balance MAE vs heuristic: ${pct(worstPersona)} (needs 0% or lower)`,
      worstPersona <= 0,
    ],
    [
      `Shifted people balance MAE vs heuristic: ${pct(shiftedWorse)} (needs +5% or lower)`,
      shiftedWorse <= 0.05,
    ],
  ];
  out(`## Ship rule`);
  out();
  for (const [label, ok] of checks) out(`- ${label}: ${ok ? "pass" : "fail"}`);
  out(
    `- **Result: ${checks.every(([, ok]) => ok) ? "ship (flag may go to shadow)" : "do not ship; keep the heuristic"}**`,
  );
}
console.log(lines.join("\n"));
