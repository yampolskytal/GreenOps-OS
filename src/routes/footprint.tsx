import { createFileRoute, redirect } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/footprint")({
  head: () =>
    seo(
      "Digital Footprint — GreenOps OS",
      "The daily footprint calendar is now part of Explore & Findings.",
    ),
  beforeLoad: () => {
    throw redirect({ to: "/explore" });
  },
});
