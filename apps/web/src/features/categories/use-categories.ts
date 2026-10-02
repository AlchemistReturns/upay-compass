import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Category = {
  id: number;
  key: string;
  name_en: string;
  name_bn: string;
  icon: string;
  is_essential: boolean;
};

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("*").order("id");
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });
}
