// Task step counts, measured from the real UI code, against an estimated reference flow.
// Run: pnpm ux:tasks
import {
  MODES,
  REFERENCE_STEPS,
  TASKS,
  TASK_KEYS,
  countFlow,
  writeUsabilityData,
} from "./ux-tasks.ts";

console.log("Steps per task. Counts are MEASURED from the UI code; reference steps are ESTIMATES");
console.log("(editable in scripts/ux-tasks.ts).\n");
console.log(
  "| Task | Mode | Screens | Taps | Fields | Speak | Confirm | Total steps | Estimated reference steps | % fewer steps |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|");
const rows: object[] = [];
for (const key of TASK_KEYS) {
  for (const mode of MODES) {
    const c = countFlow(TASKS[key].flows[mode]);
    const ref = REFERENCE_STEPS[key];
    const fewer = Math.round(((ref - c.total) / ref) * 100);
    rows.push({ task: key, mode, total: c.total, reference: ref, fewerPct: fewer });
    console.log(
      `| ${TASKS[key].label} | ${mode} | ${c.screens} | ${c.taps} | ${c.fields} | ${c.speaks} | ${c.confirms} | ${c.total} | ${ref} | ${fewer}% |`,
    );
  }
}

writeUsabilityData("tasks", { rows });
