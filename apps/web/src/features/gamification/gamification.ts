import { Flame, GraduationCap, Medal, PiggyBank, Target, type LucideIcon } from "lucide-react";

export const BADGES = [
  { id: "first_goal", icon: Target },
  { id: "streak_7", icon: Flame },
  { id: "budget_master", icon: PiggyBank },
  { id: "module_graduate", icon: GraduationCap },
] as const satisfies readonly { id: string; icon: LucideIcon }[];

export type GamificationState = {
  streak_days: number;
  badges: { id: string; earned_at: string }[];
};

/** What touch_activity() and complete_module() return. */
export type GamificationResult = GamificationState & { new_badges: string[] };

export const badgeIcon = (id: string): LucideIcon => BADGES.find((b) => b.id === id)?.icon ?? Medal;

export const GAMIFICATION_EVENTS = {
  result: "compass:gamification",
  check: "compass:check-badges",
} as const;

/** Hand a fresh server result to the provider (updates the cache and shows the badge toast). */
export function announceGamification(result: GamificationResult) {
  window.dispatchEvent(
    new CustomEvent<GamificationResult>(GAMIFICATION_EVENTS.result, { detail: result }),
  );
}

/** Ask the provider to re-evaluate badges after something that may have earned one. */
export function requestBadgeCheck() {
  window.dispatchEvent(new Event(GAMIFICATION_EVENTS.check));
}
