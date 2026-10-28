import { redirect } from "next/navigation";

// Requests used to live under /portal/help.
export default function HelpPage() {
  redirect("/portal/requests");
}
