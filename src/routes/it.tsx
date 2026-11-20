import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppShell, FindingList, Kpi, Panel } from "@/components/app/shell";
import { itQuery, chf } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/it")({
  head: () => ({ meta: [ { title: "IT Manager dashboard — GreenLedger" }, { name: "description", content: "Servers, GPU, data platform and AI models with protection windows and contradictions." }, { property: "og:title", content: "IT Manager dashboard — GreenLedger" }, { property: "og:description", content: "Servers, GPU, data platform and AI models with protection windows and contradictions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(itQuery),
  component: It,
});

function It() {
  const { data } = useSuspenseQuery(itQuery);
  const flagged = data.servers.filter((s) => s.flag).length;
  return (
    <AppShell kicker="Operations view" title="What runs, what idles, what is protected">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="GPU utilisation" value={`${data.gpu.gpuAvgPct}%`} hint={`${data.gpu.uptimeH30d} h up in 30 days · ${data.gpu.location}`} tone="bad" />
        <Kpi label="GPU cost per year" value={chf(data.gpu.costChfYear)} hint={data.gpu.id} />
        <Kpi label="Flagged servers" value={`${flagged} / ${data.servers.length}`} hint="idle, orphaned or over-sized" />
        <Kpi label="AI tokens (30d)" value={`${data.ai.reduce((a, m) => a + m.tokensM, 0)} M`} hint={chf(data.ai.reduce((a, m) => a + m.costChf, 0))} />
      </div>
      <Panel title="Servers" className="mt-6">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="pb-2">Server</th><th>Provider</th><th>Loc.</th><th>Env</th><th>vCPU</th><th>CPU avg</th><th>Last login</th><th>Flag</th></tr>
          </thead>
          <tbody>
            {data.servers.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="num py-2">{s.id}</td><td>{s.provider}</td><td>{s.location}</td>
                <td><span className={cn("rounded px-1.5 text-xs", s.environment === "prod" ? "bg-accent text-accent-foreground" : "bg-muted")}>{s.environment}</span></td>
                <td className="num">{s.vcpu}</td>
                <td className="num"><span className={cn(s.cpuAvgPct < 10 && "text-destructive")}>{s.cpuAvgPct}%</span></td>
                <td className="num text-muted-foreground">{s.lastLogin}</td>
                <td className="text-xs text-warning-foreground">{s.flag ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Data platform: runtime vs. active use">
          <div className="space-y-4">
            {data.platform.map((p) => (
              <div key={p.cluster}>
                <div className="flex justify-between text-sm"><span>{p.cluster}</span><span className="num">{p.activeH}/{p.runtimeH} h</span></div>
                <div className="mt-1 h-2.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(p.activeH / p.runtimeH) * 100}%` }} /></div>
                {p.protectedWindows.length > 0 && <p className="mt-1 text-xs text-destructive">Protected: {p.protectedWindows.join(" · ")}</p>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="AI models">
          <ul className="space-y-2 text-sm">
            {data.ai.map((m) => (
              <li key={m.model} className="flex justify-between border-t pt-2 first:border-t-0 first:pt-0">
                <span>{m.model}<span className="block text-xs text-muted-foreground">{m.provider}</span></span>
                <span className="num text-right">{m.tokensM} M<span className="block text-xs text-muted-foreground">{chf(m.costChf)}</span></span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Limits & contradictions"><FindingList items={data.findings} /></Panel>
      </div>
    </AppShell>
  );
}
