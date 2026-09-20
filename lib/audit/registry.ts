import type { Check } from "@/lib/audit/types";
import { deployCheck } from "@/lib/audit/checks/chk-01-deploy";
import { seoCheck } from "@/lib/audit/checks/chk-02-seo";
import { perfCheck } from "@/lib/audit/checks/chk-03-perf";
import { supabaseCheck } from "@/lib/audit/checks/chk-04-supabase";
import { hygieneCheck } from "@/lib/audit/checks/chk-05-hygiene";

export const checks: Check[] = [deployCheck, seoCheck, perfCheck, supabaseCheck, hygieneCheck];
