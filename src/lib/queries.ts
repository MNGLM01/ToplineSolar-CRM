import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { DEFAULT_ESTIMATE } from "./estimate";
import type { EstimateSettings, LostReason, Partner, Profile, Source, Stage } from "./types";

const STALE = 5 * 60_000;

export const useStages = () => useQuery({
  queryKey: ["stages"], staleTime: STALE,
  queryFn: async () => {
    const { data, error } = await supabase.from("lead_stages").select("*").order("sort");
    if (error) throw error; return data as Stage[];
  },
});
export const useSources = () => useQuery({
  queryKey: ["sources"], staleTime: STALE,
  queryFn: async () => {
    const { data, error } = await supabase.from("lead_sources").select("*").order("sort");
    if (error) throw error; return data as Source[];
  },
});
export const useLostReasons = () => useQuery({
  queryKey: ["lost_reasons"], staleTime: STALE,
  queryFn: async () => {
    const { data, error } = await supabase.from("lost_reasons").select("*").order("sort");
    if (error) throw error; return data as LostReason[];
  },
});
export const useProfiles = () => useQuery({
  queryKey: ["profiles"], staleTime: STALE,
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) throw error; return data as Profile[];
  },
});
export const usePartners = (enabled = true) => useQuery({
  queryKey: ["partners"], staleTime: STALE, enabled,
  queryFn: async () => {
    const { data, error } = await supabase.from("partners").select("*").is("deleted_at", null).order("name");
    if (error) throw error; return data as Partner[];
  },
});
export const useEstimateSettings = () => useQuery({
  queryKey: ["settings", "solar_estimate"], staleTime: STALE,
  queryFn: async () => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "solar_estimate").maybeSingle();
    return { ...DEFAULT_ESTIMATE, ...((data?.value as Partial<EstimateSettings>) ?? {}) } as EstimateSettings;
  },
});

/** Sales users who can be assigned leads (active staff). */
export const assignable = (profiles: Profile[] | undefined) =>
  (profiles ?? []).filter((p) => p.active && p.role !== "partner");
