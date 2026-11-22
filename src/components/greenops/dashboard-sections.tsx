import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DashboardSections({
  label,
  sections,
  sectionForHash,
  onSectionChange,
  value,
}: {
  label: string;
  sections: readonly { id: string; label: string; content: ReactNode }[];
  sectionForHash: (hash: string) => string;
  onSectionChange?: (section: string) => void;
  value?: string;
}) {
  const hash = useRouterState({ select: (state) => state.location.hash.replace(/^#/, "") });
  const [localTab, setTab] = useState(() => sectionForHash(hash));
  const requested = value ?? localTab;
  const tab = sections.some(({ id }) => id === requested) ? requested : sections[0]?.id;
  const clearsHash = onSectionChange != null;
  useEffect(() => {
    if (value == null && (hash || !clearsHash)) setTab(sectionForHash(hash));
  }, [hash, sectionForHash, clearsHash, value]);
  return (
    <Tabs
      value={tab ?? ""}
      activationMode="manual"
      onValueChange={(value) => {
        setTab(value);
        onSectionChange?.(value);
        window.scrollTo({ top: 0 });
      }}
    >
      <TabsList aria-label={label} className="mb-4">
        {sections.map(({ id, label }) => (
          <TabsTrigger key={id} value={id} className="max-sm:px-2 max-sm:text-xs">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map(({ id, content }) => (
        <TabsContent key={id} value={id}>
          {tab === id && content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
