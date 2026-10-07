import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth-provider";
import { registerPasskey } from "./passkey";

export type PasskeyRow = {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
};

export function usePasskeys() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["passkeys", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PasskeyRow[]> => {
      const { data, error } = await supabase.rpc("list_passkeys");
      if (error) throw error;
      return (data ?? []) as PasskeyRow[];
    },
  });
}

export function useAddPasskey() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deviceName: string) => {
      const result = await registerPasskey(deviceName);
      if (result === "error") throw new Error("passkey_failed");
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys", userId] }),
  });
}

export function useDeletePasskey() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_passkey", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["passkeys", userId] }),
  });
}
