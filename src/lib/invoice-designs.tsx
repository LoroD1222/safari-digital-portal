import "server-only";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_LOGO } from "./invoice-logo";
import { INTER_400, INTER_500, INTER_600, INTER_700 } from "./invoice-fonts";
import { invoiceState } from "./types";
import type { InvoicePdfData } from "./invoice-pdf";

Font.register({ family: "Inter", fonts: [
  { src: INTER_400, fontWeight: 400 }, { src: INTER_500, fontWeight: 500 },
  { src: INTER_600, fontWeight: 600 }, { src: INTER_700, fontWeight: 700 },
] });
Font.registerHyphenationCallback((w) => [w]);

const C = { ink: "#000321", slate: "#565A7C", body: "#3F4458", line: "#E6E8EC", soft: "#F7F8F6", brand: "#1A6647", forest: "#0D3B2E", mint: "#5DC49A", mintBg: "#F1FAF6", red: "#B42318", redBg: "#FEF3F2" };
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthName = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

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

// ───────────── Option A · "Clean" ─────────────
// Amount due card next to the client, light table, totals on the right, M-Pesa as 3 steps.
function DesignA({ d }: { d: InvoicePdfData }) {
  const { i, state, items, subtotal, discounts, total, to } = parts(d);
  const paid = state === "paid", overdue = state === "overdue";
  const lbl = { fontSize: 7, fontWeight: 600, color: C.slate, letterSpacing: 1.1, textTransform: "uppercase" as const };
  return (
    <Document title={`Invoice ${i.number} · ${d.client.name}`} author="Safari Digital">
      <Page size="A4" style={{ fontFamily: "Inter", fontSize: 9, color: C.ink, paddingBottom: 60, lineHeight: 1.45 }}>
        <Header right={
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600, letterSpacing: 0.4 }}>Invoice</Text>
            <Text style={{ color: C.mint, fontSize: 9, fontWeight: 500, marginTop: 4 }}>{i.number}</Text>
          </View>
        } />
        <View style={{ paddingHorizontal: 44 }}>
          {/* Billed to + amount due */}
          <View style={{ flexDirection: "row", marginTop: 30, gap: 24 }}>
            <View style={{ flex: 1 }}>
              <Text style={lbl}>Billed to</Text>
              <Text style={{ fontSize: 18, fontWeight: 700, marginTop: 6, marginBottom: 4, letterSpacing: -0.2, lineHeight: 1.2 }}>{d.client.name}</Text>
              {to.map((t) => <Text key={t} style={{ color: C.body, marginTop: 1 }}>{t}</Text>)}
            </View>
            <View style={{ width: 200, borderRadius: 8, padding: 16, backgroundColor: paid ? C.mintBg : overdue ? C.redBg : C.soft, borderWidth: 1, borderColor: paid ? "#BFE3CF" : overdue ? "#FECDCA" : C.line }}>
              <Text style={lbl}>{paid ? "Amount paid" : "Amount due"}</Text>
              <Text style={{ fontSize: 24, fontWeight: 700, marginTop: 6, lineHeight: 1.15, color: paid ? C.brand : overdue ? C.red : C.forest, letterSpacing: -0.4 }}>{usd(total)}</Text>
              <Text style={{ color: C.body, marginTop: 4 }}>{paid ? `Paid ${i.paid_at ? day(i.paid_at) : ""}` : `${overdue ? "Was due" : "Due"} ${day(i.due_date)}`}</Text>
              <View style={{ alignSelf: "flex-start", marginTop: 8, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: paid ? C.brand : overdue ? C.red : C.forest }}>
                <Text style={{ color: "#FFFFFF", fontSize: 7, fontWeight: 600, letterSpacing: 0.8 }}>{paid ? "PAID" : overdue ? "OVERDUE" : state === "cancelled" ? "CANCELLED" : "UNPAID"}</Text>
              </View>
            </View>
          </View>

          {/* Facts */}
          <View style={{ flexDirection: "row", marginTop: 24, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }}>
            {[["Invoice number", i.number], ["Issue date", day(i.issue_date)], ["Due date", day(i.due_date)], ["Period", i.period_month ? monthName(i.period_month) : "One-time"]].map(([k, v]) => (
              <View key={k} style={{ flex: 1 }}><Text style={lbl}>{k}</Text><Text style={{ fontWeight: 600, marginTop: 3 }}>{v}</Text></View>
            ))}
          </View>

          {/* Items */}
          <View style={{ flexDirection: "row", marginTop: 26, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.ink }}>
            <Text style={[lbl, { flex: 1 }]}>Description</Text>
            <Text style={[lbl, { width: 90, textAlign: "right" }]}>Amount</Text>
          </View>
          {items.map((it, n) => (
            <View key={n} wrap={false} style={{ flexDirection: "row", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flex: 1, paddingRight: 20 }}>
                <Text style={{ fontWeight: 600, color: it.amount < 0 ? C.brand : C.ink }}>{it.description}</Text>
                {it.details ? <Text style={{ color: C.slate, fontSize: 8, marginTop: 2 }}>{it.details}</Text> : null}
              </View>
              <Text style={{ width: 90, textAlign: "right", fontWeight: 500, color: it.amount < 0 ? C.brand : C.ink }}>{usd(it.amount)}</Text>
            </View>
          ))}

          {/* Totals */}
          <View style={{ alignSelf: "flex-end", width: 230, marginTop: 12 }}>
            {discounts.length > 0 && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}><Text style={{ color: C.body }}>Subtotal</Text><Text>{usd(subtotal)}</Text></View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}><Text style={{ color: C.body }}>Discount</Text><Text style={{ color: C.brand }}>{usd(discounts.reduce((n, x) => n + x.amount, 0))}</Text></View>
              </>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: C.ink }}>
              <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{paid ? "Total paid" : "Total due"}</Text>
              <Text style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{usd(total)}</Text>
            </View>
            <Text style={{ textAlign: "right", color: C.slate, fontSize: 7.5, marginTop: 3 }}>All amounts in US dollars (USD)</Text>
          </View>

          {i.notes ? <Text style={{ marginTop: 18, color: C.body }}>{i.notes}</Text> : null}

          {/* Payment */}
          {paid ? (
            <View wrap={false} style={{ marginTop: 26, flexDirection: "row", borderRadius: 8, backgroundColor: C.mintBg, overflow: "hidden" }}>
              <View style={{ width: 4, backgroundColor: C.brand }} />
              <View style={{ padding: 14 }}>
                <Text style={{ fontWeight: 700, color: C.brand, fontSize: 10.5 }}>Payment received, thank you!</Text>
                <Text style={{ color: C.body, marginTop: 2 }}>{[i.paid_at ? `Paid on ${day(i.paid_at)}` : null, i.payment_method, i.payment_ref ? `Ref ${i.payment_ref}` : null].filter(Boolean).join("  ·  ")}</Text>
              </View>
            </View>
          ) : (
            <View wrap={false} style={{ marginTop: 26, flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              <View style={{ width: 4, backgroundColor: C.mint }} />
              <View style={{ flex: 1, padding: 16 }}>
                <Text style={{ fontWeight: 700, fontSize: 11 }}>How to pay · M-Pesa</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                  {[["1", "Send money to", d.mpesaNumber ?? "—"], ["2", "Name shown", d.mpesaName ?? "—"], ["3", "Use reference", i.number]].map(([n, k, v]) => (
                    <View key={n} style={{ flex: 1, flexDirection: "row", gap: 8 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.forest, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: 700 }}>{n}</Text></View>
                      <View><Text style={{ color: C.slate, fontSize: 7.5 }}>{k}</Text><Text style={{ fontWeight: 700, fontSize: 10.5, marginTop: 1 }}>{v}</Text></View>
                    </View>
                  ))}
                </View>
                {d.terms ? <Text style={{ color: C.slate, fontSize: 7.5, marginTop: 12, lineHeight: 1.5 }}>{d.terms}</Text> : null}
              </View>
            </View>
          )}

          <Text style={{ marginTop: 22, color: C.slate, fontSize: 8.5 }}>Questions about this invoice? Reply on WhatsApp or by email.</Text>
        </View>
        <Footer d={d} />
      </Page>
    </Document>
  );
}

// ───────────── Option B · "Statement" ─────────────
// Key facts on a mint band, striped table, dark total bar, M-Pesa tiles.
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

export async function invoiceDesignPdf(design: "a" | "b", d: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(design === "a" ? <DesignA d={d} /> : <DesignB d={d} />);
}
