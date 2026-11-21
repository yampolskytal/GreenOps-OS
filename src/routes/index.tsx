import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("GreenOps OS — Your planning workspace", "Source-backed recommended strategies, costs, energy and CO₂ for your executive, finance and IT dashboards."),
  component: OpenWorkspace,
});
function OpenWorkspace() {
  const { s, hydrated } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (hydrated) void navigate({ to: s.role === "cfo" ? "/cfo" : s.role === "it" ? "/it" : "/ceo", replace: true });
  }, [hydrated, s.role, navigate]);
  return <p role="status" className="p-6 text-sm text-muted-foreground">Opening your workspace…</p>;
}
