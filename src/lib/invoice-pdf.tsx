import "server-only";
import { Document, Font, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_LOGO } from "./invoice-logo";
import { INTER_400, INTER_500, INTER_600, INTER_700 } from "./invoice-fonts";
import { invoiceState } from "./types";
import type { Invoice } from "./types";

export type InvoicePdfData = {
  invoice: Invoice;
  client: { name: string; contact_name?: string | null; contact_email?: string | null; whatsapp?: string | null; website_url?: string | null };
  from: string; tin: string | null; mpesaNumber: string | null; mpesaName: string | null; terms: string | null;
};

Font.register({ family: "Inter", fonts: [
  { src: INTER_400, fontWeight: 400 }, { src: INTER_500, fontWeight: 500 },
  { src: INTER_600, fontWeight: 600 }, { src: INTER_700, fontWeight: 700 },
] });
Font.registerHyphenationCallback((w) => [w]);

const C = { ink: "#000321", slate: "#565A7C", body: "#3F4458", line: "#E6E8EC", soft: "#F7F8F6", brand: "#1A6647", forest: "#0D3B2E", mint: "#5DC49A", mintBg: "#F1FAF6", red: "#B42318", redBg: "#FEF3F2" };
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function parts(d: InvoicePdfData) {
  const i = d.invoice;
  const state = invoiceState(i);
  const items = i.items.map((x) => ({ ...x, amount: Number(x.amount) }));
  const subtotal = items.filter((x) => x.amount > 0).reduce((n, x) => n + x.amount, 0);
  const discounts = items.filter((x) => x.amount < 0);
  const fromLines = d.from.split("\n").filter(Boolean);
  const to = [d.client.contact_name, d.client.contact_email, d.client.whatsapp, d.client.website_url?.replace(/^https?:\/\//, "")].filter(Boolean) as string[];
  return { i, state, items, subtotal, discounts, total: Number(i.total), fromLines, to };
}

function Header({ right }: { right: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: "#000000", paddingVertical: 22, paddingHorizontal: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={INVOICE_LOGO} style={{ width: 170, height: 27 }} />
      {right}
    </View>
  );
}

function Footer({ d }: { d: InvoicePdfData }) {
  const f = d.from.split("\n").filter(Boolean);
  const line = [f[0], f.length > 1 ? f[f.length - 1] : null, d.tin ? `TIN ${d.tin}` : null].filter(Boolean).join("  ·  ");
  return (
    <>
      <View fixed style={{ position: "absolute", left: 44, right: 44, bottom: 42, height: 1, backgroundColor: C.line }} />
      <Text fixed style={{ position: "absolute", left: 44, right: 44, bottom: 26, fontSize: 7, color: C.slate, textAlign: "center" }}>{line}</Text>
    </>
  );
}

// The invoice PDF ("Statement" design): black header with the logo, key facts on a
// mint band, striped lines table, dark total bar and M-Pesa tiles. Inter is embedded.
function DesignB({ d }: { d: InvoicePdfData }) {
  const { i, state, items, subtotal, discounts, total, to, fromLines } = parts(d);
  const paid = state === "paid", overdue = state === "overdue";
  const lbl = { fontSize: 7, fontWeight: 600, color: C.slate, letterSpacing: 1.1, textTransform: "uppercase" as const };
  const status = paid ? "Paid" : overdue ? "Overdue" : state === "cancelled" ? "Cancelled" : "Unpaid";
  return (
    <Document title={`Invoice ${i.number} · ${d.client.name}`} author="Safari Digital">
      <Page size="A4" style={{ fontFamily: "Inter", fontSize: 9, color: C.ink, paddingBottom: 60, lineHeight: 1.45 }}>
        <Header right={<Text style={{ color: C.mint, fontSize: 10, fontWeight: 700, letterSpacing: 2.5 }}>INVOICE</Text>} />
        <View style={{ backgroundColor: C.mintBg, paddingVertical: 16, paddingHorizontal: 44, flexDirection: "row", alignItems: "center" }}>
          {[["Invoice no.", i.number], ["Issued", day(i.issue_date)], ["Due", day(i.due_date)]].map(([k, v]) => (
            <View key={k} style={{ flex: 1 }}><Text style={lbl}>{k}</Text><Text style={{ fontWeight: 600, marginTop: 3, fontSize: 10 }}>{v}</Text></View>
          ))}
          <View style={{ flex: 1.3, alignItems: "flex-end" }}>
            <Text style={lbl}>{paid ? "Amount paid" : "Amount due"}</Text>
            <Text style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2, color: overdue ? C.red : C.forest, marginTop: 2 }}>{usd(total)}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 44 }}>
          <View style={{ flexDirection: "row", marginTop: 26, gap: 28 }}>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Billed to</Text>
              <Text style={{ fontWeight: 700, fontSize: 13, marginTop: 5, marginBottom: 2, lineHeight: 1.25 }}>{d.client.name}</Text>
              {to.map((t) => <Text key={t} style={{ color: C.body }}>{t}</Text>)}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>From</Text>
              <Text style={{ fontWeight: 700, fontSize: 13, marginTop: 5, marginBottom: 2, lineHeight: 1.25 }}>{fromLines[0] ?? "Safari Digital"}</Text>
              {fromLines.slice(1).map((t) => <Text key={t} style={{ color: C.body }}>{t}</Text>)}
              {d.tin ? <Text style={{ color: C.body }}>TIN {d.tin}</Text> : null}
            </View>
            <View style={{ width: 70, alignItems: "flex-end" }}>
              <Text style={lbl}>Status</Text>
              <Text style={{ marginTop: 5, fontWeight: 700, color: paid ? C.brand : overdue ? C.red : C.ink }}>{status}</Text>
            </View>
          </View>

          <View style={{ marginTop: 26, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: "row", backgroundColor: C.forest, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1 }}>DESCRIPTION</Text>
              <Text style={{ width: 90, textAlign: "right", color: "#FFFFFF", fontSize: 7.5, fontWeight: 600, letterSpacing: 1 }}>AMOUNT</Text>
            </View>
            {items.map((it, n) => (
              <View key={n} wrap={false} style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: n % 2 ? C.soft : "#FFFFFF" }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ fontWeight: 600, color: it.amount < 0 ? C.brand : C.ink }}>{it.description}</Text>
                  {it.details ? <Text style={{ color: C.slate, fontSize: 8, marginTop: 2 }}>{it.details}</Text> : null}
                </View>
                <Text style={{ width: 90, textAlign: "right", fontWeight: 500, color: it.amount < 0 ? C.brand : C.ink }}>{usd(it.amount)}</Text>
              </View>
            ))}
            {discounts.length > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 24, paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ color: C.body }}>Subtotal {usd(subtotal)}</Text>
                <Text style={{ color: C.brand }}>Discount {usd(discounts.reduce((n, x) => n + x.amount, 0))}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#000000", paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: 600, fontSize: 10.5 }}>{paid ? "Total paid (USD)" : "Total due (USD)"}</Text>
              <Text style={{ color: C.mint, fontWeight: 700, fontSize: 16 }}>{usd(total)}</Text>
            </View>
          </View>

          {i.notes ? <Text style={{ marginTop: 16, color: C.body }}>{i.notes}</Text> : null}

          {paid ? (
            <View wrap={false} style={{ marginTop: 24, padding: 14, borderRadius: 6, backgroundColor: C.mintBg, borderWidth: 1, borderColor: "#BFE3CF" }}>
              <Text style={{ fontWeight: 700, color: C.brand, fontSize: 10.5 }}>Paid, thank you!</Text>
              <Text style={{ color: C.body, marginTop: 2 }}>{[i.paid_at ? `Received ${day(i.paid_at)}` : null, i.payment_method, i.payment_ref ? `Ref ${i.payment_ref}` : null].filter(Boolean).join("  ·  ")}</Text>
            </View>
          ) : (
            <View wrap={false} style={{ marginTop: 24 }}>
              <Text style={{ fontWeight: 700, fontSize: 11 }}>Pay with M-Pesa</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                {[["M-Pesa number", d.mpesaNumber ?? "—"], ["Account name", d.mpesaName ?? "—"], ["Reference", i.number]].map(([k, v]) => (
                  <View key={k} style={{ flex: 1, borderRadius: 6, borderWidth: 1, borderColor: C.line, paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={lbl}>{k}</Text>
                    <Text style={{ fontWeight: 700, fontSize: 12, marginTop: 3 }}>{v}</Text>
                  </View>
                ))}
              </View>
              {d.terms ? <Text style={{ color: C.slate, fontSize: 7.5, marginTop: 10, lineHeight: 1.5 }}>{d.terms}</Text> : null}
            </View>
          )}
          <Text style={{ marginTop: 22, color: C.slate, fontSize: 8.5 }}>Questions about this invoice? Reply on WhatsApp or by email.</Text>
        </View>
        <Footer d={d} />
      </Page>
    </Document>
  );
}

export async function invoicePdf(d: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<DesignB d={d} />);
}
