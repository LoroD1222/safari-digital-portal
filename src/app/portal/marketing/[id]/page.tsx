import { redirect } from "next/navigation";

// Links in emails and activity open the item in the Content dialog.
export default async function ContentItemPage(props: PageProps<"/portal/marketing/[id]">) {
  const { id } = await props.params;
  redirect(`/portal/marketing?open=${encodeURIComponent(id)}`);
}
