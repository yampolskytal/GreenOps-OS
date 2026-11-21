import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GreenOpsLogo, ROLES } from "@/components/greenops/shell";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => seo("GreenOps OS — Choose your role", "Explore your company's digital operations."),
  component: Welcome,
});

const descriptions = {
  ceo: "Strategy, sustainability targets and management decisions.",
  cfo: "Digital spending, cost savings and financial planning.",
  it: "Resource efficiency, infrastructure and operational risks.",
};

function Welcome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-8 sm:px-10">
      <header>
        <GreenOpsLogo />
      </header>
      <section className="my-auto py-12">
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Who are you?
        </h1>
        <p className="mt-4 text-center text-muted-foreground">
          Choose your role to explore your company's digital operations.
        </p>
        <div className="mt-10 grid auto-rows-fr gap-4 md:grid-cols-3">
          {ROLES.map(({ id, to, label, Icon }) => (
            <Link
              key={id}
              to={to}
              className="group flex min-w-0 flex-col rounded-xl border border-[#C8FA50]/40 bg-card p-6 transition-colors hover:border-[#C8FA50] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8FA50]"
            >
              <span className="mb-6 grid size-11 place-items-center rounded-lg bg-[#C8FA50] text-[#1a2410]">
                <Icon className="size-5" />
              </span>
              <h2 className="text-xl font-semibold">{label}</h2>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">{descriptions[id]}</p>
              <ArrowRight
                aria-hidden
                className="mt-auto size-5 self-end transition-transform group-hover:translate-x-1"
              />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
