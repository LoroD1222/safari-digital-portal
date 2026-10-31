import { describe, expect, it } from "vitest";
import { TEMPLATES, composeEmail, firstName, personalize, signature, type FollowupRule, type TemplateKey } from "@/lib/followup-presets";
import { DAY, HOUR, MAX_ATTEMPTS, guestTimezone, inWindow, nextSendTime, planFollowups, travelEnd, type Cycle, type PlanInput, type SendRow } from "@/lib/followup-plan";

// Monday 3 Nov 2025, 10:00 in Dar es Salaam (07:00 UTC)
const MON = Date.UTC(2025, 10, 3, 7);
const iso = (t: number) => new Date(t).toISOString();

function rulesFor(t: TemplateKey, createdAt = iso(MON - 30 * DAY)): FollowupRule[] {
  return TEMPLATES[t].presets.map((p, i) => ({
    id: `r${i}`, client_id: "c1", preset: p.key, step: p.step, stage: p.stage, days: p.days, name: p.step,
    subject: p.subject, body: p.body, enabled: true, created_at: createdAt, timing_changed_at: createdAt,
  }));
}

function cycle(stage: Cycle["stage"], confirmedAt: number, extra: Partial<Cycle> = {}): Cycle {
  return { id: "cy1", stage, started_at: iso(confirmedAt), confirmed_at: iso(confirmedAt), last_operator_at: iso(confirmedAt), status: "active", pause_reason: null, resumed_at: null, ...extra };
}

function input(o: Partial<PlanInput> & { rules: FollowupRule[]; cycle: Cycle | null }): PlanInput {
  return {
    now: MON,
    settings: { enabled: true, enabled_at: iso(MON - 60 * DAY), quote_valid_days: null, senderReady: true },
    maxSends: o.rules.length, sends: [],
    inquiry: { email: "sarah@example.com", stopped: false, suppressed: false, travelDates: "July 2027", country: "Tanzania" },
    timezone: "Africa/Dar_es_Salaam",
    ...o,
  };
}

const sent = (ruleId: string, at: number, extra: Partial<SendRow> = {}): SendRow =>
  ({ cycle_id: "cy1", step_key: ruleId, channel: "email", status: "sent", attempts: 1, sent_at: iso(at), created_at: iso(at), ...extra });

describe("1. schedules", () => {
  it("has 5, 10 and 15 emails with the right days per stage", () => {
    const days = (t: TemplateKey, s: string) => TEMPLATES[t].presets.filter((p) => p.stage === s).map((p) => p.days);
    expect(TEMPLATES.gentle.presets).toHaveLength(5);
    expect(TEMPLATES.standard.presets).toHaveLength(10);
    expect(TEMPLATES.persistent.presets).toHaveLength(15);
    expect(days("gentle", "contacted")).toEqual([4]);
    expect(days("gentle", "quoted")).toEqual([4, 12, 25]);
    expect(days("gentle", "negotiating")).toEqual([7]);
    expect(days("standard", "contacted")).toEqual([2, 6]);
    expect(days("standard", "quoted")).toEqual([2, 5, 10, 17, 28, 42]);
    expect(days("standard", "negotiating")).toEqual([3, 9]);
    expect(days("persistent", "contacted")).toEqual([1, 3, 7]);
    expect(days("persistent", "quoted")).toEqual([1, 3, 6, 10, 15, 22, 30, 45, 60]);
    expect(days("persistent", "negotiating")).toEqual([2, 5, 12]);
  });

  it("only uses the current stage's emails: Quote sent on Standard gets at most six", () => {
    const rules = rulesFor("standard");
    const quoteIds = rules.filter((r) => r.stage === "quoted").map((r) => r.id);
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 1 * DAY) }));
    expect(plan.remaining).toBe(6);
    expect(quoteIds).toContain(plan.next!.rule.id);
  });

  it("schedules the first step from the confirmed message, inside the window", () => {
    const rules = rulesFor("standard");
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 1 * DAY), now: MON }));
    expect(plan.state).toBe("scheduled");
    expect(plan.next!.rule.step).toBe("S3");
    expect(plan.next!.dueAt).toBe(MON + DAY); // Tuesday 10:00 local, already in the window
    expect(plan.next!.sendNow).toBe(false);
  });
});

describe("2. stage transitions and confirmation", () => {
  it("never starts before the operator confirms the message", () => {
    const plan = planFollowups(input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 5 * DAY, { status: "awaiting", confirmed_at: null }) }));
    expect(plan.state).toBe("awaiting");
    expect(plan.next).toBeNull();
  });

  it("does nothing for New, Booked or Lost (no open cycle)", () => {
    expect(planFollowups(input({ rules: rulesFor("standard"), cycle: null })).state).toBe("none");
  });

  it("a later manual message pushes the next email back 72 hours", () => {
    const rules = rulesFor("standard");
    const anchor = MON - 2 * DAY;
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", anchor, { last_operator_at: iso(MON - 1 * HOUR) }) }));
    expect(plan.next!.dueAt).toBeGreaterThanOrEqual(MON - HOUR + 72 * HOUR);
  });
});

describe("3. guest replied", () => {
  it("pauses with 'Paused: guest replied' and schedules nothing", () => {
    const plan = planFollowups(input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 5 * DAY, { status: "replied", pause_reason: "Guest replied" }) }));
    expect(plan.state).toBe("replied");
    expect(plan.label).toMatch(/guest replied/i);
    expect(plan.next).toBeNull();
  });

  it("on resume, skips what was missed and never sends several at once", () => {
    const rules = rulesFor("standard");
    const anchor = MON - 20 * DAY;
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", anchor, { resumed_at: iso(MON) }) }));
    const skipped = plan.skip.map((s) => s.rule.step);
    expect(skipped).toEqual(["S3", "S4", "S5", "S6"]); // due on days 2, 5, 10, 17: all before the resume
    expect(plan.next!.rule.step).toBe("S7");
  });
});

describe("4. booked and lost", () => {
  it("an ended cycle (Booked/Lost or moved) plans nothing", () => {
    const plan = planFollowups(input({ rules: rulesFor("standard"), cycle: cycle("negotiating", MON - 5 * DAY, { status: "ended" }) }));
    expect(plan.state).toBe("none");
  });
});

describe("5. global and per-email switches", () => {
  it("does nothing when follow-ups are off", () => {
    const i = input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 3 * DAY) });
    expect(planFollowups({ ...i, settings: { ...i.settings, enabled: false } }).state).toBe("off");
  });

  it("skips emails that are switched off", () => {
    const rules = rulesFor("standard").map((r) => (r.step === "S3" ? { ...r, enabled: false } : r));
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 3 * DAY) }));
    expect(plan.next!.rule.step).toBe("S4");
  });

  it("stops for a guest who was stopped or whose address is suppressed", () => {
    const i = input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 3 * DAY) });
    expect(planFollowups({ ...i, inquiry: { ...i.inquiry, stopped: true } }).state).toBe("stopped");
    expect(planFollowups({ ...i, inquiry: { ...i.inquiry, suppressed: true } }).state).toBe("stopped");
  });
});

describe("6. no duplicates", () => {
  it("a step that was sent (or is being sent) is never planned again", () => {
    const rules = rulesFor("standard");
    const s3 = rules.find((r) => r.step === "S3")!;
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 3 * DAY), sends: [sent(s3.id, MON - DAY)] }));
    expect(plan.next!.rule.step).toBe("S4");
    const planSending = planFollowups(input({ rules, cycle: cycle("quoted", MON - 3 * DAY), sends: [sent(s3.id, MON - DAY, { status: "sending" })] }));
    expect(planSending.next!.rule.step).toBe("S4");
  });

  it("keeps at least ~2 days between automatic emails", () => {
    const rules = rulesFor("persistent");
    const p4 = rules.find((r) => r.step === "P4")!;
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 3 * DAY), sends: [sent(p4.id, MON - 6 * HOUR)] }));
    expect(plan.next!.rule.step).toBe("P5");
    expect(plan.next!.dueAt).toBeGreaterThanOrEqual(MON - 6 * HOUR + 40 * HOUR);
  });

  it("never sends more than the template's total to one guest", () => {
    const rules = rulesFor("gentle");
    const sends = rules.map((r, i) => sent(r.id, MON - (10 - i) * DAY, { cycle_id: "old" }));
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 3 * DAY), sends, maxSends: rules.length }));
    expect(plan.state).toBe("limit");
  });
});

describe("7. switching template", () => {
  it("new emails that would already be due are skipped, not backfilled", () => {
    const rules = rulesFor("persistent", iso(MON - HOUR)); // installed an hour ago
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 8 * DAY) }));
    expect(plan.skip.map((s) => s.rule.step)).toEqual(["P4", "P5", "P6"]); // days 1, 3, 6
    expect(plan.next!.rule.step).toBe("P7");
    expect(plan.next!.dueAt).toBeGreaterThan(MON);
  });

  it("changing an email's timing never sends it late", () => {
    const rules = rulesFor("standard").map((r) => (r.step === "S5" ? { ...r, days: 3, timing_changed_at: iso(MON - HOUR) } : r));
    const s3 = rules.find((r) => r.step === "S3")!;
    const plan = planFollowups(input({ rules, cycle: cycle("quoted", MON - 4 * DAY), sends: [sent(s3.id, MON - 2 * DAY)] }));
    expect(plan.skip.map((s) => s.rule.step)).toEqual(["S5"]);
  });

  it("doesn't flood when follow-ups are first switched on", () => {
    const i = input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 12 * DAY) });
    const plan = planFollowups({ ...i, settings: { ...i.settings, enabled_at: iso(MON - HOUR) } });
    expect(plan.skip.map((s) => s.rule.step)).toEqual(["S3", "S4", "S5"]);
    expect(plan.next!.rule.step).toBe("S6");
  });
});

describe("8. provider errors and retries", () => {
  it("retries a failed step until the attempts run out", () => {
    const rules = rulesFor("standard");
    const s3 = rules.find((r) => r.step === "S3")!;
    const failedOnce = planFollowups(input({ rules, cycle: cycle("quoted", MON - 2 * DAY), sends: [sent(s3.id, MON - HOUR, { status: "failed", sent_at: null, attempts: 1 })] }));
    expect(failedOnce.next!.rule.step).toBe("S3");
    expect(failedOnce.next!.attempt).toBe(2);
    const exhausted = planFollowups(input({ rules, cycle: cycle("quoted", MON - 2 * DAY), sends: [sent(s3.id, MON - HOUR, { status: "failed", sent_at: null, attempts: MAX_ATTEMPTS })] }));
    expect(exhausted.next!.rule.step).toBe("S4");
  });
});

describe("9. time zones and the sending window", () => {
  it("only sends Monday–Friday, 9:00–17:00 local time", () => {
    const tz = "Europe/London";
    const sat = Date.UTC(2025, 10, 8, 12); // Saturday noon
    const mon9 = Date.UTC(2025, 10, 10, 9); // London is UTC+0 in November
    expect(nextSendTime(sat, tz)).toBe(mon9);
    const lateFri = Date.UTC(2025, 10, 7, 18);
    expect(nextSendTime(lateFri, tz)).toBe(mon9);
    const early = Date.UTC(2025, 10, 4, 5);
    expect(nextSendTime(early, tz)).toBe(Date.UTC(2025, 10, 4, 9));
    expect(inWindow(Date.UTC(2025, 10, 4, 12), tz)).toBe(true);
  });

  it("handles daylight saving", () => {
    // London summer time (UTC+1): 9:00 local = 08:00 UTC
    expect(nextSendTime(Date.UTC(2025, 6, 7, 5), "Europe/London")).toBe(Date.UTC(2025, 6, 7, 8));
    // New York on the Monday after the November change (UTC-5): 9:00 local = 14:00 UTC
    expect(nextSendTime(Date.UTC(2025, 10, 3, 12), "America/New_York")).toBe(Date.UTC(2025, 10, 3, 14));
  });

  it("uses the guest's country when it has one time zone, otherwise the operator's", () => {
    expect(guestTimezone("Germany", "Africa/Dar_es_Salaam")).toBe("Europe/Berlin");
    expect(guestTimezone("United States", "Africa/Dar_es_Salaam")).toBe("Africa/Dar_es_Salaam");
    expect(guestTimezone(null, "Europe/London")).toBe("Europe/London");
  });
});

describe("10. expired quotes and passed travel dates", () => {
  it("pauses quote follow-ups once the quote has expired", () => {
    const i = input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 31 * DAY) });
    const plan = planFollowups({ ...i, settings: { ...i.settings, quote_valid_days: 30 } });
    expect(plan.state).toBe("quote_expired");
    expect(plan.next).toBeNull();
  });

  it("pauses when the travel dates have passed, and never guesses unclear dates", () => {
    const i = input({ rules: rulesFor("standard"), cycle: cycle("quoted", MON - 3 * DAY) });
    expect(planFollowups({ ...i, inquiry: { ...i.inquiry, travelDates: "August 2025" } }).state).toBe("trip_passed");
    expect(planFollowups({ ...i, inquiry: { ...i.inquiry, travelDates: "sometime next summer" } }).state).toBe("scheduled");
    expect(travelEnd("10/12/2025 - 20/12/2025")).toBe(Date.UTC(2025, 11, 20, 23, 59));
    expect(travelEnd("July 2027")).toBe(Date.UTC(2027, 6, 31, 23, 59));
    expect(travelEnd("flexible")).toBeNull();
  });
});

describe("personalisation", () => {
  const v = { firstName: "Sarah", trip: null, travelDates: null, agent: null, company: "Golden Trips" };

  it("uses safe fallbacks and never leaves a tag behind", () => {
    expect(personalize("Hi {{first_name}}, your {{trip_name}} for {{travel_dates}} {{unknown}}.", { ...v, firstName: null }))
      .toBe("Hello, your Tanzania safari for your travel dates.");
    expect(personalize("Hi {{first_name}},", v)).toBe("Hi Sarah,");
    expect(firstName("sarah.m@example.com")).toBeNull();
    expect(firstName("anna schmidt")).toBe("Anna");
  });

  it("signs with the agent and company, without repeating the company", () => {
    expect(signature({ agent: "Juma", company: "Golden Trips" })).toBe("Best regards,\n\nJuma\nGolden Trips");
    expect(signature({ agent: null, company: "Golden Trips" })).toBe("Best regards,\n\nGolden Trips");
    expect(signature({ agent: "Golden Trips", company: "Golden Trips" })).toBe("Best regards,\n\nGolden Trips");
  });

  it("builds the exact copy plus signature", () => {
    const s1 = TEMPLATES.standard.presets[0];
    const mail = composeEmail(s1, { ...v, agent: "Juma" });
    expect(mail.subject).toBe("Can we help with your safari plans?");
    expect(mail.body.startsWith("Hi Sarah,\n\nThank you again for your interest in visiting Tanzania.")).toBe(true);
    expect(mail.body.endsWith("Best regards,\n\nJuma\nGolden Trips")).toBe(true);
    expect(mail.body).not.toMatch(/\{\{|\}\}|undefined/);
  });

  it("every one of the 30 emails renders cleanly with nothing known", () => {
    for (const t of ["gentle", "standard", "persistent"] as const) {
      for (const p of TEMPLATES[t].presets) {
        const m = composeEmail(p, { firstName: null, trip: null, travelDates: null, agent: null, company: "Golden Trips" });
        expect(m.body).not.toMatch(/\{\{|\}\}|undefined|null/);
        expect(m.body.startsWith("Hello,")).toBe(true);
      }
    }
  });
});
