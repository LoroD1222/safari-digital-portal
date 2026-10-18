import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { reset, error } = await props.searchParams;
  return <LoginForm notice={reset === "sent" ? "Check your email for a link to set a new password." : undefined} linkError={error === "link"} />;
}
