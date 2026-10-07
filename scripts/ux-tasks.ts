import { readFileSync, writeFileSync } from "node:fs";

// Shared step model for ux-task-analysis.ts and ux-personas.ts.
//
// MEASURED: the step lists below were counted by reading the real UI code (file named per flow).
// A step is one thing the person must do: tap (open a screen / pick an option), field (type or
// enter a value), speak (say the sentence), confirm (the final button that saves or sends).
// Fields left at their default (date, channel, alert threshold, optional goal date) are not counted.

export type StepKind = "tap" | "field" | "speak" | "confirm";
export type Mode = "tap" | "voice";
export type TaskKey = "addPayment" | "askCoach" | "setBudget" | "createGoal" | "addToGoal";

export type Flow = {
  /** screens or sheets the person lands on, counting the starting screen */
  screens: number;
  steps: { kind: StepKind; what: string }[];
};

const fab = { kind: "tap", what: "mic button" } as const;
const speak = { kind: "speak", what: "say the sentence" } as const;
const confirmCard = { kind: "confirm", what: "confirm on the card" } as const;
/** voice flows for the four commands: command-card.tsx, voice-sheet.tsx (one sheet, one card) */
const voiceCommand: Flow = { screens: 1, steps: [fab, speak, confirmCard] };

export const TASKS: Record<TaskKey, { label: string; flows: Record<Mode, Flow> }> = {
  addPayment: {
    label: "Add a payment",
    flows: {
      // dashboard.tsx quick action -> transaction-form.tsx
      tap: {
        screens: 2,
        steps: [
          { kind: "tap", what: "Add on the dashboard" },
          { kind: "field", what: "amount" },
          { kind: "field", what: "who it was paid to" },
          { kind: "confirm", what: "Save" },
        ],
      },
      voice: voiceCommand,
    },
  },
  askCoach: {
    label: "Ask coach: can I afford X?",
    flows: {
      // bottom-nav.tsx -> coach-view.tsx chat form
      tap: {
        screens: 2,
        steps: [
          { kind: "tap", what: "Coach tab" },
          { kind: "field", what: "type the question" },
          { kind: "confirm", what: "Send" },
        ],
      },
      // voice-sheet.tsx hands an ask_coach question straight to /coach, which sends it itself
      voice: { screens: 2, steps: [fab, speak] },
    },
  },
  setBudget: {
    label: "Set a budget",
    flows: {
      // bottom-nav.tsx -> budgets-view.tsx sheet -> budget-form.tsx
      tap: {
        screens: 2,
        steps: [
          { kind: "tap", what: "Budgets tab" },
          { kind: "tap", what: "New budget" },
          { kind: "tap", what: "pick a category" },
          { kind: "field", what: "monthly limit" },
          { kind: "confirm", what: "Save" },
        ],
      },
      voice: voiceCommand,
    },
  },
  createGoal: {
    label: "Create a goal",
    flows: {
      // bottom-nav.tsx -> goals-view.tsx sheet -> NewGoalForm
      tap: {
        screens: 2,
        steps: [
          { kind: "tap", what: "Goals tab" },
          { kind: "tap", what: "New goal" },
          { kind: "field", what: "goal name" },
          { kind: "field", what: "target amount" },
          { kind: "confirm", what: "Create" },
        ],
      },
      voice: voiceCommand,
    },
  },
  addToGoal: {
    label: "Add money to a goal",
    flows: {
      // bottom-nav.tsx -> goal-card.tsx sheet -> AddMoneyForm
      tap: {
        screens: 2,
        steps: [
          { kind: "tap", what: "Goals tab" },
          { kind: "tap", what: "Add money on the goal" },
          { kind: "field", what: "amount" },
          { kind: "confirm", what: "Add" },
        ],
      },
      voice: voiceCommand,
    },
  },
};

/**
 * ESTIMATE, not measured: steps for the same task in a typical wallet / finance app (open the app
 * and sign in, find the feature in a menu, fill each field, review, confirm). Edit these to your
 * own check; every "% fewer" figure follows.
 */
export const REFERENCE_STEPS: Record<TaskKey, number> = {
  addPayment: 8,
  askCoach: 5,
  setBudget: 7,
  createGoal: 7,
  addToGoal: 6,
};

export const TASK_KEYS = Object.keys(TASKS) as TaskKey[];
export const MODES: Mode[] = ["tap", "voice"];

export function countFlow(flow: Flow) {
  const n = (k: StepKind) => flow.steps.filter((s) => s.kind === k).length;
  return {
    screens: flow.screens,
    taps: n("tap"),
    fields: n("field"),
    speaks: n("speak"),
    confirms: n("confirm"),
    total: flow.steps.length,
  };
}

/** Where the admin "Usability evidence" section reads from. Each script updates its own part. */
export const USABILITY_JSON = new URL(
  "../apps/web/src/features/admin/usability-data.json",
  import.meta.url,
);

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

export function writeUsabilityData(part: "tasks" | "personas", data: unknown) {
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(readFileSync(USABILITY_JSON, "utf8"));
  } catch {
    // first run
  }
  all[part] = { generatedAt: new Date().toISOString(), ...(data as object) };
  writeFileSync(USABILITY_JSON, JSON.stringify(all, null, 2) + "\n");
}
