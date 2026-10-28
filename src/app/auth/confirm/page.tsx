import { Confirm } from "./confirm";

export default async function ConfirmPage(props: PageProps<"/auth/confirm">) {
  const sp = await props.searchParams;
  const hash = typeof sp.token_hash === "string" ? sp.token_hash : null;
  const type = sp.type === "recovery" ? "recovery" : "invite";
  return <Confirm token={hash ? { hash, type } : null} />;
}
