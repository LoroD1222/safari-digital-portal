import type { Metadata } from "next";
import { StageLabels } from "@/components/stage-labels";
import CallsPage from "@/app/portal/calls/page";

export const metadata: Metadata = { title: "Cold calling" };

// Same page as Safari Digital's internal account (/portal/calls), for admins.
export default function AdminCallsPage(props: PageProps<"/admin/calls">) {
  return <StageLabels internal><CallsPage {...(props as unknown as PageProps<"/portal/calls">)} /></StageLabels>;
}
