import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a password" };

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { welcome } = await props.searchParams;
  return welcome
    ? <ResetForm title="Welcome to your portal" intro="Choose a password to finish setting up your account." />
    : <ResetForm title="Choose a new password" intro="You'll use it the next time you sign in." />;
}
