import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdfData } from "@/lib/invoices";
import { invoicePdf } from "@/lib/invoice-pdf";
import type { Invoice } from "@/lib/types";

// Download an invoice as PDF. Row-level security decides who may see it:
// admins see every invoice, clients only their own sent or paid ones.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const inv = data as Invoice;
  const pdf = await invoicePdf(await pdfData(createAdminClient(), inv));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
