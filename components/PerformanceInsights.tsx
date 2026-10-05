"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

import { redactPerformanceEvent } from "@/lib/observability/performance";

export function PerformanceInsights() {
  return <SpeedInsights beforeSend={redactPerformanceEvent} debug={false} />;
}
