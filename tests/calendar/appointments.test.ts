import { describe, expect, it } from "vitest";
import { addDays, eat, eatToIso, googleCalendarUrl, longWhen, overlaps, weekStart } from "@/lib/appointments";

describe("appointments in Tanzania time", () => {
  it("converts EAT to UTC and back", () => {
    expect(eatToIso("2026-11-24", "10:30")).toBe("2026-11-24T07:30:00.000Z");
    expect(eat("2026-11-24T22:15:00Z")).toMatchObject({ date: "2026-11-25", time: "01:15", weekday: 2 });
  });
  it("finds the Monday of the week", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16"); // Friday → Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("describes and links a meeting", () => {
    const a = { title: "Intro call", starts_at: "2026-11-24T07:30:00.000Z", duration_min: 30, kind: "online" as const, meeting_link: "https://meet.google.com/abc", location: null, notes: null };
    expect(longWhen(a.starts_at, 30)).toBe("Tuesday 24 November 2026, 10:30–11:00 (Tanzania time, EAT)");
    expect(googleCalendarUrl(a)).toContain("dates=20261124T073000Z%2F20261124T080000Z");
  });
  it("spots clashes", () => {
    const a = { starts_at: "2026-11-24T07:30:00Z", duration_min: 30 };
    expect(overlaps(a, { starts_at: "2026-11-24T07:45:00Z", duration_min: 30 })).toBe(true);
    expect(overlaps(a, { starts_at: "2026-11-24T08:00:00Z", duration_min: 30 })).toBe(false);
  });
});
