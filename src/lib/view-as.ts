import "server-only";
import { cookies } from "next/headers";

// "View as client": an admin sees the portal as one client. Stored in a cookie for 8 hours.
export const VIEW_AS_COOKIE = "sd_view_as";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function viewAsClientId() {
  const v = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}
