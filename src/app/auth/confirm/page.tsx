import { getViewer } from "@/lib/auth";
import { Confirm } from "./confirm";

export default async function ConfirmPage(props: PageProps<"/auth/confirm">) {
  const sp = await props.searchParams;
  const hash = typeof sp.token_hash === "string" ? sp.token_hash : null;
  const type = sp.type === "recovery" ? "recovery" : "invite";
  // Someone already signed in on this browser (often the admin testing an invite):
  // warn before the invite replaces their login.
  const viewer = hash ? await getViewer() : null;
  return <Confirm token={hash ? { hash, type } : null} signedInAs={viewer?.email ?? null} />;
}
