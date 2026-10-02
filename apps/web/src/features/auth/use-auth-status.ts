import { useProfile } from "@/features/profile/use-profile";
import { useAuth } from "./auth-provider";
import { useLock } from "./lock-provider";

export type AuthStatus =
  "loading" | "signed-out" | "needs-pin" | "locked" | "needs-onboarding" | "error" | "ready";

/** Single source of truth for where a visitor belongs. Pages redirect based on this. */
export function useAuthStatus() {
  const { userId, loading } = useAuth();
  const { pinState, locked, reload: reloadLock } = useLock();
  const profile = useProfile(userId);

  let status: AuthStatus;
  if (loading) status = "loading";
  else if (!userId) status = "signed-out";
  else if (pinState === "error") status = "error";
  else if (pinState === "unknown") status = "loading";
  else if (pinState === "none") status = "needs-pin";
  else if (locked) status = "locked";
  else if (profile.isError) status = "error";
  else if (profile.isPending) status = "loading";
  else if (!profile.data.onboarded) status = "needs-onboarding";
  else status = "ready";

  const retry = () => {
    reloadLock();
    void profile.refetch();
  };

  return { status, profile: profile.data ?? null, retry };
}
