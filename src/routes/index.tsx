import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Calculator, Server, Leaf } from "lucide-react";
import { MockBanner } from "@/components/app/shell";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [ { title: "GreenLedger — Choose your role" }, { name: "description", content: "Pick the CEO, CFO or IT Manager view of costs, energy and CO₂." }, { property: "og:title", content: "GreenLedger — Choose your role" }, { property: "og:description", content: "Pick the CEO, CFO or IT Manager view of costs, energy and CO₂." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  component: RoleSelect,
});

const roles = [
  { to: "/ceo", icon: Briefcase, title: "CEO", text: "Are we on track for −40% CO₂ and −25% costs within CHF 16,500? Approve the package." },
  { to: "/cfo", icon: Calculator, title: "CFO", text: "Where does the money go — by department, tool and currency? Idle seats and notice dates." },
  { to: "/it", icon: Server, title: "IT Manager", text: "Which servers, clusters and models drive energy? What is protected and must not be touched?" },
] as const;

function RoleSelect() {
  return (
    <div className="min-h-screen">
      <MockBanner />
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="flex items-center gap-2 text-primary"><Leaf className="h-5 w-5" /><span className="font-display text-lg">GreenLedger</span></div>
        <h1 className="mt-6 max-w-3xl text-5xl leading-tight">Electricity is the new currency. Here are the books.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">Cloud, servers, AI and SaaS of a Basel SME — costs, energy and location-based CO₂ in one ledger. Choose how you want to look at it.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {roles.map((r) => (
            <Link key={r.to} to={r.to} className="panel group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-primary">
              <r.icon className="h-6 w-6 text-primary" />
              <h2 className="mt-4 text-2xl">{r.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{r.text}</p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">Open dashboard <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
