import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Leaf } from "lucide-react";
import { DemoBanner, ROLES } from "@/components/greenops/shell";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("GreenOps OS — Choose how to explore", "Explore costs, energy and CO₂ of cloud, servers, AI and SaaS as CEO, CFO or IT Manager."),
  component: Welcome,
});

const TEXT = {
  ceo: { title: "Executive Overview", text: "Are we on track for −40% CO₂ and −25% cost? The three biggest opportunities and risks at a glance." },
  cfo: { title: "Financial Intelligence", text: "Costs by department, provider and service. Build a savings portfolio within the CHF 16,500 budget." },
  it: { title: "Technical Operations", text: "Servers, GPU, data platform and AI usage. What idles, what is protected, what to change safely." },
};

function Welcome() {
  const { set } = useApp(); const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-hero">
      <DemoBanner />
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="rise-in flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary"><Leaf className="h-4 w-4 text-primary-foreground" /></span><span className="font-display text-lg font-semibold">GreenOps <span className="text-primary">OS</span></span></div>
        <h1 className="rise-in mt-10 max-w-3xl text-4xl font-semibold leading-[1.1] md:text-6xl">How would you like to explore <span className="bg-gradient-primary bg-clip-text text-transparent">GreenOps</span>?</h1>
        <p className="rise-in mt-5 max-w-2xl text-muted-foreground">See where cloud, servers, AI and SaaS create costs, energy use and CO₂ — and pick safe measures to cut them. You can switch roles at any time; your selections stay.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {ROLES.map((r, i) => (
            <button key={r.id} onClick={() => { set({ role: r.id }); navigate({ to: r.to }); }} style={{ animationDelay: `${i * 80}ms` }}
              className="card-elevated rise-in group flex flex-col p-7 text-left transition duration-300 hover:-translate-y-1 hover:shadow-glow">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground"><r.Icon className="h-6 w-6" /></span>
              <span className="mt-6 text-xs font-semibold uppercase tracking-widest text-primary">{r.label}</span>
              <span className="mt-1 font-display text-2xl font-semibold">{TEXT[r.id].title}</span>
              <span className="mt-3 flex-1 text-sm text-muted-foreground">{TEXT[r.id].text}</span>
              <span className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </button>
          ))}
        </div>
        <p className="mt-10 text-xs text-muted-foreground">Presentation mode — no login. sprintd Basel GreenTech Edition · ALTYCA Green AI & Data case.</p>
      </div>
    </div>
  );
}
