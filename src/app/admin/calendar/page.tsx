import type { Metadata } from "next";
import { StageLabels } from "@/components/stage-labels";
import CalendarPage from "@/app/portal/calendar/page";

export const metadata: Metadata = { title: "Calendar" };

// Same page as Safari Digital's internal account (/portal/calendar), for admins.
export default function AdminCalendarPage(props: PageProps<"/admin/calendar">) {
  return <StageLabels internal><CalendarPage {...(props as unknown as PageProps<"/portal/calendar">)} /></StageLabels>;
}
