// Runs every migration on an in-memory Postgres (PGlite) and checks the database rules:
// stage cycles, cancelling on Booked/Lost, no duplicate sends, and separation between operators.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../supabase/migrations");
const A = "00000000-0000-0000-0000-0000000000a1"; // operator A
const B = "00000000-0000-0000-0000-0000000000a2"; // operator B
const UA = "00000000-0000-0000-0000-0000000000b1";
const UB = "00000000-0000-0000-0000-0000000000b2";
let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const as = async (user: string | null) => db.exec(user ? `set role authenticated; set test.uid = '${user}';` : `reset role; set test.uid = '';`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create publication supabase_realtime;
    grant usage on schema public, auth, storage to authenticated;
  `);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(DIR, f), "utf8"));
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    insert into public.clients (id, name) values ('${A}', 'Golden Trips'), ('${B}', 'Other Safaris');
    insert into auth.users (id, email) values ('${UA}', 'a@x.com'), ('${UB}', 'b@x.com');
    insert into public.profiles (id, email, role, client_id) values ('${UA}', 'a@x.com', 'client', '${A}'), ('${UB}', 'b@x.com', 'client', '${B}')
      on conflict (id) do update set role = excluded.role, client_id = excluded.client_id;
    insert into public.followup_rules (client_id, preset, step, stage, days, name, subject, body) values
      ('${A}', 'v2:standard:S1', 'S1', 'contacted', 2, 'S1', 'Can we help?', 'Hi'),
      ('${A}', 'v2:standard:S3', 'S3', 'quoted', 2, 'S3', 'Proposal?', 'Hi'),
      ('${A}', 'v2:standard:S4', 'S4', 'quoted', 5, 'S4', 'Questions?', 'Hi');
  `);
});

async function newInquiry(name: string, client = A) {
  const [r] = await q<{ id: string }>(`insert into public.inquiries (client_id, customer_name, email) values ('${client}', '${name}', '${name.toLowerCase()}@example.com') returning id`);
  return r.id;
}

describe("2. stage transitions", () => {
  it("New opens no cycle; Quote sent opens one that waits for confirmation", async () => {
    const id = await newInquiry("Sarah");
    expect(await q(`select * from public.followup_cycles where inquiry_id = '${id}'`)).toHaveLength(0);
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'quoted')`);
    const [c] = await q<{ status: string; stage: string }>(`select status, stage from public.followup_cycles where inquiry_id = '${id}'`);
    expect(c).toMatchObject({ status: "awaiting", stage: "quoted" });
    await db.exec(`select public.confirm_followup_message('${id}')`);
    const [c2] = await q<{ status: string; confirmed: boolean }>(`select status, confirmed_at is not null as confirmed from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`);
    expect(c2).toMatchObject({ status: "active", confirmed: true });
    await as(null);
  });

  it("moving the card ends the cycle, cancels its unsent steps and starts a new one", async () => {
    const id = await newInquiry("Peter");
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'quoted'); select public.confirm_followup_message('${id}');`);
    await db.exec(`select public.set_inquiry_status('${id}', 'negotiating')`);
    await as(null);
    const cycles = await q<{ stage: string; status: string }>(`select stage, status from public.followup_cycles where inquiry_id = '${id}' order by started_at`);
    expect(cycles).toEqual([{ stage: "quoted", status: "ended" }, { stage: "negotiating", status: "awaiting" }]);
    const canceled = await q<{ rule_name: string; status: string }>(`select rule_name, status from public.followup_sends where inquiry_id = '${id}' order by rule_name`);
    expect(canceled).toEqual([{ rule_name: "S3", status: "canceled" }, { rule_name: "S4", status: "canceled" }]);
  });
});

describe("3. guest replied, pause and resume", () => {
  it("records the reply and resumes only on request", async () => {
    const id = await newInquiry("Grace");
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'quoted'); select public.confirm_followup_message('${id}');`);
    await db.exec(`select public.set_followup_cycle_state('${id}', 'replied')`);
    expect((await q<{ status: string; pause_reason: string }>(`select status, pause_reason from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`))[0])
      .toEqual({ status: "replied", pause_reason: "Guest replied" });
    await db.exec(`select public.set_followup_cycle_state('${id}', 'active')`);
    expect((await q<{ status: string; resumed: boolean }>(`select status, resumed_at is not null as resumed from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`))[0])
      .toEqual({ status: "active", resumed: true });
    await as(null);
  });
});

describe("4. booked and lost", () => {
  it("ends the cycle with the reason", async () => {
    for (const [stage, reason] of [["booked", "Booked"], ["closed", "Lost"]]) {
      const id = await newInquiry(`Guest${stage}`);
      await as(UA);
      await db.exec(`select public.set_inquiry_status('${id}', 'quoted'); select public.confirm_followup_message('${id}');`);
      await db.exec(`select public.set_inquiry_status('${id}', '${stage}')`);
      await as(null);
      const open = await q(`select * from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`);
      expect(open).toHaveLength(0);
      const [ended] = await q<{ end_reason: string }>(`select end_reason from public.followup_cycles where inquiry_id = '${id}'`);
      expect(ended.end_reason).toBe(reason);
    }
  });
});

describe("6. no duplicate sends", () => {
  it("a second claim for the same step in the same cycle fails", async () => {
    const id = await newInquiry("Tom");
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'quoted'); select public.confirm_followup_message('${id}');`);
    await as(null);
    const [c] = await q<{ id: string }>(`select id from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`);
    const [r] = await q<{ id: string }>(`select id from public.followup_rules where step = 'S3'`);
    const claim = `insert into public.followup_sends (client_id, inquiry_id, cycle_id, step_key, rule_id, rule_name, stage, stage_since, channel, to_address, subject, status)
      values ('${A}', '${id}', '${c.id}', '${r.id}', '${r.id}', 'S3', 'quoted', now(), 'email', 'tom@example.com', 'Proposal?', 'sending')`;
    await db.exec(claim);
    await expect(db.exec(claim)).rejects.toThrow(/duplicate key/);
  });
});

describe("12. operators are kept apart", () => {
  it("one operator can't see or change another's follow-ups or inquiries", async () => {
    const theirs = await newInquiry("Hidden", B);
    await as(UB);
    expect(await q(`select * from public.followup_rules`)).toHaveLength(0);
    expect(await q(`select * from public.inquiries where client_id = '${A}'`)).toHaveLength(0);
    await as(UA);
    await expect(db.exec(`select public.confirm_followup_message('${theirs}')`)).rejects.toThrow(/not found/i);
    await expect(db.exec(`select public.set_followups('${B}', true, 'standard')`)).rejects.toThrow(/not allowed/i);
    await expect(db.exec(`insert into public.followup_rules (client_id, stage, days, name, subject, body) values ('${B}', 'quoted', 2, 'x', 'x', 'x')`)).rejects.toThrow(/row-level security/);
    expect(await q(`select * from public.followup_cycles where client_id = '${B}'`)).toHaveLength(0);
    // Clients can't change their own sender or mark it ready.
    await db.exec(`update public.followup_settings set sender_ready = true`);
    await as(null);
    expect(await q(`select * from public.followup_settings where sender_ready`)).toHaveLength(0);
  });
});

describe("11. suppressed addresses", () => {
  it("only Safari Digital's server writes suppressions; clients can read their own", async () => {
    await as(null);
    await db.exec(`insert into public.followup_suppressions (client_id, email, reason) values ('${A}', 'bounced@example.com', 'Email bounced')`);
    await as(UA);
    expect(await q(`select email from public.followup_suppressions`)).toEqual([{ email: "bounced@example.com" }]);
    await expect(db.exec(`insert into public.followup_suppressions (client_id, email, reason) values ('${A}', 'x@y.z', 'x')`)).rejects.toThrow(/row-level security/);
    await as(UB);
    expect(await q(`select email from public.followup_suppressions`)).toHaveLength(0);
    await as(null);
  });
});

describe("No show (internal pipeline)", () => {
  it("starts follow-ups at once, without waiting for confirmation", async () => {
    await as(null);
    const id = await newInquiry("Mika");
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'meeting')`);
    expect(await q(`select * from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`)).toHaveLength(0);
    await db.exec(`select public.set_inquiry_status('${id}', 'no_show')`);
    await as(null);
    const [c] = await q<{ stage: string; status: string; confirmed: boolean }>(`select stage, status, confirmed_at is not null as confirmed from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`);
    expect(c).toEqual({ stage: "no_show", status: "active", confirmed: true });
  });

  it("No answer starts follow-ups at once too", async () => {
    await as(null);
    const id = await newInquiry("Juma");
    await as(UA);
    await db.exec(`select public.set_inquiry_status('${id}', 'no_answer')`);
    await as(null);
    const [c] = await q<{ stage: string; status: string }>(`select stage, status from public.followup_cycles where inquiry_id = '${id}' and status <> 'ended'`);
    expect(c).toEqual({ stage: "no_answer", status: "active" });
  });
});

describe("Instant reply", () => {
  it("operators save their own instant reply, not another's; each inquiry is claimed once", async () => {
    await as(UA);
    await db.exec(`select public.set_followup_autoreply('${A}', true, 'Thanks {{first_name}}', '')`);
    await expect(db.exec(`select public.set_followup_autoreply('${B}', true, 'x', 'x')`)).rejects.toThrow(/not allowed/i);
    await as(null);
    const [s] = await q<{ autoreply_enabled: boolean; autoreply_subject: string; autoreply_body: string | null }>(`select autoreply_enabled, autoreply_subject, autoreply_body from public.followup_settings where client_id = '${A}'`);
    expect(s).toEqual({ autoreply_enabled: true, autoreply_subject: "Thanks {{first_name}}", autoreply_body: null });
    const id = await newInquiry("Anna");
    const claim = `update public.inquiries set autoreply_status = 'sending', autoreply_at = now() where id = '${id}' and autoreply_status is null returning id`;
    expect(await q(claim)).toHaveLength(1);
    expect(await q(claim)).toHaveLength(0);
    await expect(db.exec(`update public.inquiries set autoreply_status = 'bogus' where id = '${id}'`)).rejects.toThrow(/autoreply_status/);
  });
});

describe("Client Resend keys", () => {
  it("no signed-in user can read or write them", async () => {
    await as(null);
    await db.exec(`insert into public.client_resend (client_id, api_key) values ('${A}', 're_secret_key_123456')`);
    await as(UA);
    // (The test setup grants every table back to signed-in users; row security alone still hides them.)
    expect(await q(`select * from public.client_resend`)).toHaveLength(0);
    await expect(db.exec(`insert into public.client_resend (client_id, api_key) values ('${B}', 're_x')`)).rejects.toThrow(/row-level security/);
    await as(null);
  });
});

describe("Minute and hour timing", () => {
  it("allows 5 minutes to 3 days in minutes, or 1 to 60 days, never both", async () => {
    await as(null);
    const ins = (days: number, mins: string) => db.exec(`insert into public.followup_rules (client_id, stage, days, delay_minutes, name, subject, body) values ('${A}', 'quoted', ${days}, ${mins}, 'x', 'x', 'x')`);
    await ins(0, "30");
    await ins(3, "null");
    await expect(ins(0, "2")).rejects.toThrow(/followup_rules_days/);
    await expect(ins(2, "30")).rejects.toThrow(/followup_rules_days/);
    await expect(ins(0, "null")).rejects.toThrow(/followup_rules_days/);
  });
});
