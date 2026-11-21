import { useApp } from "@/lib/store";
import { useBreakdowns } from "@/lib/queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ExplorationScope() {
  const { s, set } = useApp();
  const breakdowns = useBreakdowns();
  return (
    <section className="mb-5 border-b pb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { key: "department", label: "Department", values: breakdowns.data?.byDepartment },
            { key: "provider", label: "Provider", values: breakdowns.data?.byProvider },
          ] as const
        ).map((field) => (
          <label key={field.key} className="min-w-0 text-xs text-muted-foreground">
            {field.label}
            <Select value={s[field.key]} onValueChange={(v) => set({ [field.key]: v })}>
              <SelectTrigger
                aria-label={`Exploration ${field.label.toLowerCase()}`}
                className="mt-1 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {field.label.toLowerCase()}s</SelectItem>
                {field.values?.map((v) => (
                  <SelectItem key={v.label} value={v.label}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Exploration scope: {s.department === "all" ? "all departments" : s.department} ·{" "}
          {s.provider === "all" ? "all providers" : s.provider}
          {" · "}Official plan and exports keep September 2025–August 2026.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => set({ department: "all", provider: "all" })}
        >
          Clear filters
        </Button>
      </div>
    </section>
  );
}
