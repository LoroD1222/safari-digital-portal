import { Tabs } from "@/components/blocks";

export function MarketingTabs({ active, awaiting }: { active: "content" | "advertising"; awaiting: number }) {
  return (
    <Tabs label="Marketing" items={[
      { href: "/portal/marketing", label: "Content", active: active === "content", count: awaiting },
      { href: "/portal/marketing/advertising", label: "Advertising", active: active === "advertising" },
    ]} />
  );
}
