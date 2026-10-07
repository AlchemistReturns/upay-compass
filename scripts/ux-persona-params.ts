// The 8 personas for the persona-based evaluation, with every parameter in one place.
// These are estimated parameters, not measurements of real people. Edit a value and
// `pnpm ux:personas` follows. Rates are per step, 0..1.
//
// The low-literacy farmer is anchored to two cited studies (the shares are used directly as
// per-step rates, which is our reading of them, not something the studies measured per step):
//   [DT]   Dhaka Tribune, farmers' DFS study: transaction complexity is the top barrier (25.39%),
//          lack of guidance 13.42%.
//   [JAFR] Journal of Agriculture and Food Research, 2024 (400 farmers): 87.3% use DFS but find it
//          very difficult; 70.5% lack PIN-change knowledge.
// Every other persona's values are ASSUMPTIONS, chosen to sit between this persona and the student.

export type PersonaParams = {
  name: string;
  lang: "bn" | "en";
  /** 0 = none, 1 = fluent: lowers the chance of a wrong tap or a lost screen */
  digitalLiteracy: number;
  /** chance a typed field needs redoing */
  typingErrorRate: number;
  /** chance the spoken sentence is misrecognised and must be repeated */
  speechMisrecognitionRate: number;
  /** most retries across one task before they give up */
  patience: number;
  /** optional: chance a tap goes wrong; when absent it follows from digitalLiteracy */
  tapErrorRate?: number;
};

export const PERSONAS: PersonaParams[] = [
  {
    name: "Low-literacy farmer",
    lang: "bn",
    digitalLiteracy: 0.127, // [JAFR] 87.3% find DFS very difficult, so 1 - 0.873
    typingErrorRate: 0.2539, // [DT] transaction complexity, the top barrier (25.39%)
    speechMisrecognitionRate: 0.25, // ASSUMPTION: no cited figure for speech
    patience: 2, // ASSUMPTION: no cited figure; [JAFR] 70.5% lack PIN-change knowledge, so little recovery without help
    tapErrorRate: 0.1342, // [DT] lack of guidance (13.42%): not knowing where to tap next
  },
  // ASSUMPTION for all personas below
  {
    name: "Rural homemaker",
    lang: "bn",
    digitalLiteracy: 0.25,
    typingErrorRate: 0.3,
    speechMisrecognitionRate: 0.2,
    patience: 3,
  },
  {
    name: "Gig worker",
    lang: "bn",
    digitalLiteracy: 0.6,
    typingErrorRate: 0.12,
    speechMisrecognitionRate: 0.2,
    patience: 2,
  },
  {
    name: "Village shopkeeper",
    lang: "bn",
    digitalLiteracy: 0.4,
    typingErrorRate: 0.2,
    speechMisrecognitionRate: 0.2,
    patience: 3,
  },
  {
    name: "Older adult",
    lang: "bn",
    digitalLiteracy: 0.2,
    typingErrorRate: 0.35,
    speechMisrecognitionRate: 0.3,
    patience: 3,
  },
  {
    name: "Student",
    lang: "en",
    digitalLiteracy: 0.9,
    typingErrorRate: 0.05,
    speechMisrecognitionRate: 0.12,
    patience: 2,
  },
  {
    name: "Salaried employee",
    lang: "en",
    digitalLiteracy: 0.8,
    typingErrorRate: 0.07,
    speechMisrecognitionRate: 0.1,
    patience: 3,
  },
  {
    name: "Small-business owner",
    lang: "bn",
    digitalLiteracy: 0.55,
    typingErrorRate: 0.15,
    speechMisrecognitionRate: 0.18,
    patience: 3,
  },
];

/** chance of a wrong tap or a lost screen for someone with digitalLiteracy 0 */
export const TAP_CONFUSION_AT_ZERO_LITERACY = 0.2;
/** runs per persona, task and mode */
export const RUNS = 2000;
export const SEED = 20261007;
