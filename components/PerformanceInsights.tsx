"use client";

import { usePathname } from "next/navigation";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { redactPerformanceEvent } from "@/lib/observability/performance";

export function PerformanceInsights() {
  const pathname = usePathname();
  if (/\/(?:replay)\//.test(pathname)) return null;
  return <SpeedInsights beforeSend={redactPerformanceEvent} debug={false} />;
}
