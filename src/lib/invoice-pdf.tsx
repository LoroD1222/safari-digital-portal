import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_LOGO } from "./invoice-logo";
import { formatMoney, invoiceState, type Invoice } from "./types";

// The invoice PDF: dark header with the logo, billed from/to, line items, total,
// and an M-Pesa payment box. Built-in Helvetica keeps it light for serverless.

export type InvoicePdfData = {
  invoice: Invoice;
  client: { name: string; contact_name?: string | null; contact_email?: string | null; whatsapp?: string | null; website_url?: string | null };
  from: string; tin: string | null; mpesaNumber: string | null; mpesaName: string | null; terms: string | null;
};

const C = { ink: "#000321", slate: "#565A7C", body: "#3F4458", line: "#E6E8EC", soft: "#F7F8F6", brand: "#1A6647", mint: "#5DC49A", red: "#9C2F2B" };
const s = StyleSheet.create({
  page: { paddingBottom: 40, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink, lineHeight: 1.45 },
  header: { backgroundColor: "#000000", paddingVertical: 22, paddingHorizontal: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 170, height: 27 },
  tag: { color: C.mint, fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 2 },
  wrap: { paddingHorizontal: 40 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  label: { fontSize: 7.5, color: C.slate, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3, fontFamily: "Helvetica-Bold" },
  big: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 18 },
  cols: { flexDirection: "row", gap: 24, marginTop: 16 },
  col: { flex: 1 },
  table: { marginTop: 22, borderWidth: 1, borderColor: C.line, borderRadius: 6 },
  th: { flexDirection: "row", backgroundColor: C.soft, paddingVertical: 7, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  tr: { flexDirection: "row", paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12 },
  pay: { marginTop: 22, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 14 },
  payBoxes: { flexDirection: "row", gap: 10, marginTop: 10 },
  payBox: { flex: 1, backgroundColor: C.soft, borderRadius: 4, paddingVertical: 9, alignItems: "center" },
});

const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function InvoiceDoc({ d }: { d: InvoicePdfData }) {
  const i = d.invoice;
  const state = invoiceState(i);
  const status = state === "paid" ? "PAID" : state === "overdue" ? "OVERDUE" : state === "cancelled" ? "CANCELLED" : "INVOICE";
  const statusColor = state === "paid" ? C.mint : state === "overdue" || state === "cancelled" ? "#F2A9A4" : C.mint;
  return (
    <Document title={`Invoice ${i.number} · ${d.client.name}`} author="Safari Digital">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={INVOICE_LOGO} style={s.logo} />
          <Text style={[s.tag, { color: statusColor }]}>{status}</Text>
        </View>
        <View style={s.wrap}>
          <View style={s.meta}>
            <View><Text style={s.label}>Invoice number</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{i.number}</Text></View>
            <View><Text style={s.label}>Invoice date</Text><Text>{day(i.issue_date)}</Text></View>
            <View><Text style={s.label}>Payment due</Text><Text style={{ fontFamily: "Helvetica-Bold", color: state === "overdue" ? C.red : C.ink }}>{day(i.due_date)}</Text></View>
            <View><Text style={s.label}>Amount due</Text><Text style={{ fontFamily: "Helvetica-Bold" }}>{state === "paid" ? formatMoney(0, i.currency) : formatMoney(Number(i.total), i.currency)}</Text></View>
          </View>

          <Text style={s.big}>{d.client.name}</Text>
          <View style={s.cols}>
            <View style={s.col}>
              <Text style={s.label}>Billed from</Text>
              <Text style={{ color: C.body }}>{d.from}</Text>
              {d.tin ? <Text style={{ color: C.body }}>TIN: {d.tin}</Text> : null}
            </View>
            <View style={s.col}>
              <Text style={s.label}>Billed to</Text>
              <Text style={{ color: C.body }}>{[d.client.name, d.client.contact_name, d.client.contact_email, d.client.whatsapp, d.client.website_url].filter(Boolean).join("\n")}</Text>
            </View>
          </View>

          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>Description</Text>
              <Text style={[s.label, { width: 90, textAlign: "right", marginBottom: 0 }]}>Amount</Text>
            </View>
            {i.items.map((it, n) => (
              <View key={n} style={s.tr} wrap={false}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{it.description}</Text>
                  {it.details ? <Text style={{ color: C.slate, fontSize: 8.5, marginTop: 2 }}>{it.details}</Text> : null}
                </View>
                <Text style={{ width: 90, textAlign: "right", color: Number(it.amount) < 0 ? C.brand : C.ink }}>
                  {Number(it.amount) < 0 ? `-${formatMoney(Math.abs(Number(it.amount)), i.currency)}` : formatMoney(Number(it.amount), i.currency)}
                </Text>
              </View>
            ))}
            <View style={s.totalRow}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Total</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16 }}>{formatMoney(Number(i.total), i.currency)}</Text>
            </View>
          </View>

          {i.notes ? <Text style={{ marginTop: 12, color: C.body }}>{i.notes}</Text> : null}

          {state === "paid" ? (
            <View style={[s.pay, { backgroundColor: "#F1FAF6", borderColor: "#BFE3CF" }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: C.brand }}>Paid{i.paid_at ? ` on ${day(i.paid_at)}` : ""}{i.payment_method ? ` · ${i.payment_method}` : ""}{i.payment_ref ? ` · Ref ${i.payment_ref}` : ""}</Text>
              <Text style={{ color: C.body, marginTop: 2 }}>Thank you for your payment.</Text>
            </View>
          ) : (
            <View style={s.pay} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Pay with M-Pesa</Text>
              {d.terms ? <Text style={{ color: C.body, marginTop: 4, fontSize: 8.5 }}>{d.terms}</Text> : null}
              <View style={s.payBoxes}>
                <View style={s.payBox}><Text style={s.label}>Number</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{d.mpesaNumber ?? "—"}</Text></View>
                <View style={s.payBox}><Text style={s.label}>Name</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{d.mpesaName ?? "—"}</Text></View>
                <View style={s.payBox}><Text style={s.label}>Reference</Text><Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{i.number}</Text></View>
              </View>
            </View>
          )}
          <Text style={{ marginTop: 24, color: C.slate, fontSize: 8, textAlign: "center" }}>Questions about this invoice? Reply on WhatsApp or email Safari Digital.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function invoicePdf(d: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc d={d} />);
}
