import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IncomeType } from "@compass/shared";
import { supabase } from "@/lib/supabase";

export type Profile = {
  id: string;
  phone: string | null;
  full_name: string | null;
  language: "bn" | "en";
  income_type: IncomeType | null;
  monthly_income: number | null;
  onboarded: boolean;
  opening_balance: number;
  roundup_enabled: boolean;
  roundup_goal_id: string | null;
  coach_consent_at: string | null;
  role: "user" | "admin";
};

export type ProfileUpdate = Partial<
  Pick<Profile, "full_name" | "language" | "income_type" | "monthly_income" | "onboarded">
>;

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useUpdateProfile(userId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}
