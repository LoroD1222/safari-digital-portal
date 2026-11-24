import { describe, expect, it } from "vitest";
import { buildImport, callStats, fillTemplate, guessMapping, normalizePhone, parseCsv, readXlsxSheet, scriptSteps, whenLabel, DEFAULT_SCRIPT } from "@/lib/calls";

describe("phone numbers", () => {
  it("turns Tanzanian formats into +255", () => {
    expect(normalizePhone("0754 123 456")).toBe("+255754123456");
    expect(normalizePhone("754123456")).toBe("+255754123456");
    expect(normalizePhone("255754123456")).toBe("+255754123456");
    expect(normalizePhone("+255 (754) 123-456")).toBe("+255754123456");
    expect(normalizePhone("00447700900123")).toBe("+447700900123");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });
  it("refuses what isn't a number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("2.55754E+11")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("reading lists", () => {
  it("parses CSV with quotes, semicolons and CRLF", () => {
    expect(parseCsv('Name,Phone\r\n"Kibo, Ltd",0754 123 456\r\n"Say ""hi""",\r\n')).toEqual([["Name", "Phone"], ["Kibo, Ltd", "0754 123 456"], ['Say "hi"', ""]]);
    expect(parseCsv("Name;Phone\nA;0712000111")).toEqual([["Name", "Phone"], ["A", "0712000111"]]);
  });
  it("reads an xlsx sheet with shared and inline strings", () => {
    const shared = `<sst><si><t>Business name</t></si><si><t>Phone</t></si><si><r><t>Kibo </t></r><r><t>&amp; Co</t></r></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="inlineStr"><is><t>x</t></is></c><c r="B2"><v>255754123456</v></c></row></sheetData></worksheet>`;
    expect(readXlsxSheet(sheet, shared)).toEqual([["Business name", "Phone"], ["Kibo & Co", "255754123456", "x"]]);
  });
  it("guesses the columns and builds the rows", () => {
    const header = ["Business name", "Owner", "Mobile", "E-mail", "Web", "Town", "Rating"];
    const m = guessMapping(header);
    expect(m).toEqual(["company", "contact_name", "phone", "email", "website", "city", "skip"]);
    const rows = [
      ["Kibo", "Daniel", "0754 123 456", "INFO@kibo.example", "kibo.example", "Arusha", "4.5"],
      ["Kibo again", "", "+255754123456", "", "", "", ""],
      ["No phone", "", "", "", "", "", ""],
      ["Known", "", "0713 000 111", "bad email", "", "", ""],
    ];
    const r = buildImport(rows, m, new Set(["+255713000111"]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ company: "Kibo", phone: "+255754123456", email: "info@kibo.example" });
    expect(r).toMatchObject({ noPhone: 1, duplicate: 1, known: 1 });
  });
  it("finds the phone column by its values when the header says nothing", () => {
    expect(guessMapping(["Col A", "Col B"], [["x", "0754123456"], ["y", "0713000111"]])).toEqual(["skip", "phone"]);
  });
});

describe("scripts", () => {
  it("fills tags and splits the script into steps", () => {
    const steps = scriptSteps(fillTemplate(DEFAULT_SCRIPT, { company: "Kibo Safaris" }));
    expect(steps[0]).toEqual({ title: "Open", say: "Hello, good morning. Am I speaking with the owner of Kibo Safaris?\n(Client: Yes.)" });
    expect(steps.map((s) => s.title)).toContain("Question");
    expect(fillTemplate("Hi {{first_name}}, {{agent_name}} here", { contact: null, agent: "Christina" })).toBe("Hi, Christina here");
    expect(fillTemplate("Hi {{first_name}}", { contact: "neema kileo" })).toBe("Hi Neema");
  });
});

describe("stats", () => {
  it("counts pick-ups by Tanzania hour and picks the best hour", () => {
    const at = (h: number, outcome: "no_answer" | "interested" | "callback") => ({ outcome, created_at: `2026-11-24T${String(h - 3).padStart(2, "0")}:10:00Z`, list_id: "l", contact_id: "c" });
    const logs = [at(9, "no_answer"), at(9, "no_answer"), at(9, "callback"), at(15, "interested"), at(15, "callback"), at(15, "no_answer"), at(16, "interested")];
    const s = callStats(logs, { from: 0 });
    expect(s.calls).toBe(7);
    expect(s.reached).toBe(4);
    expect(s.byHour.find((h) => h.hour === 9)).toMatchObject({ calls: 3, reached: 1 });
    expect(s.best?.hour).toBe(15); // 16:00 has only one call
  });
  it("labels times", () => {
    const now = Date.parse("2026-11-24T08:00:00Z");
    expect(whenLabel("2026-11-24T11:00:00Z", now)).toBe("Today 14:00");
    expect(whenLabel("2026-11-25T06:00:00Z", now)).toBe("Tomorrow 09:00");
    expect(whenLabel("2026-11-26T08:00:00Z", now)).toBe("Thu 26 Nov 11:00");
  });
});

describe("interested email", () => {
  it("attaches the case study", async () => {
    const { resendRequest } = await import("@/lib/followup-mail");
    const r = resendRequest({ fromEmail: "hi@sd.example", fromName: "Safari Digital", to: "a@b.example", subject: "s", body: "b", inquiryId: "i1", unsubscribeUrl: "https://u", idempotencyKey: "k", threadId: "<t>", kind: "cold_call", attachments: [{ filename: "Case study.pdf", path: "https://files.example/cs.pdf" }] });
    expect(r.body).toMatchObject({ attachments: [{ filename: "Case study.pdf", path: "https://files.example/cs.pdf" }] });
    expect("attachments" in resendRequest({ fromEmail: "a@b.c", fromName: "", to: "x@y.z", subject: "s", body: "b", inquiryId: "i", unsubscribeUrl: "u", idempotencyKey: "k", threadId: "t" }).body).toBe(false);
  });
});
