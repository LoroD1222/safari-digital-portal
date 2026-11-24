// Cold calling rules on an in-memory Postgres: two callers never get the same number,
// outcomes move numbers on, Do not call removes them, and only the internal account can use it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../supabase/migrations");
const SD = "00000000-0000-0000-0000-0000000000c1"; // Safari Digital (internal)
const GT = "00000000-0000-0000-0000-0000000000c2"; // a normal client
const U1 = "00000000-0000-0000-0000-0000000000d1";
const U2 = "00000000-0000-0000-0000-0000000000d2";
const UX = "00000000-0000-0000-0000-0000000000d3";
const L = "00000000-0000-0000-0000-0000000000e1";
let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const as = async (user: string | null) => db.exec(user ? `set role authenticated; set test.uid = '${user}';` : `reset role; set test.uid = '';`);
const one = async <T,>(sql: string) => (await q<T>(sql))[0];

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
    insert into public.clients (id, name, is_internal) values ('${SD}', 'Safari Digital (internal)', true), ('${GT}', 'Golden Trips', false);
    insert into auth.users (id, email) values ('${U1}', 'christina@x.com'), ('${U2}', 'lovro@x.com'), ('${UX}', 'gt@x.com');
    insert into public.profiles (id, email, role, client_id) values ('${U1}', 'christina@x.com', 'client', '${SD}'), ('${U2}', 'lovro@x.com', 'client', '${SD}'), ('${UX}', 'gt@x.com', 'client', '${GT}')
      on conflict (id) do update set role = excluded.role, client_id = excluded.client_id;
    insert into public.call_lists (id, client_id, name) values ('${L}', '${SD}', 'Arusha tour operators');
    insert into public.call_contacts (client_id, list_id, company, phone, created_at) values
      ('${SD}', '${L}', 'Kibo', '+255754000001', now() - interval '3 minutes'),
      ('${SD}', '${L}', 'Twiga', '+255754000002', now() - interval '2 minutes'),
      ('${SD}', '${L}', 'Tembo', '+255754000003', now() - interval '1 minute');
  `);
});

const company = (id: string) => one<{ company: string }>(`select company from public.call_contacts where id = '${id}'`).then((r) => r.company);

describe("shared queue", () => {
  it("gives two callers different numbers, and keeps mine while I hold it", async () => {
    await as(U1);
    const a = (await one<{ v: string }>(`select public.claim_next_call('${SD}') as v`)).v;
    await as(U2);
    const b = (await one<{ v: string }>(`select public.claim_next_call('${SD}') as v`)).v;
    expect(await company(a)).toBe("Kibo");
    expect(await company(b)).toBe("Twiga");
    // U2 can't open or log U1's number while U1 holds it.
    expect((await one<{ ok: boolean }>(`select public.claim_call('${a}') as ok`)).ok).toBe(false);
    await expect(db.exec(`select public.log_call('${a}', 'no_answer')`)).rejects.toThrow(/Someone else/);
    // Asking again gives U1 the same number back.
    await as(U1);
    expect((await one<{ v: string }>(`select public.claim_next_call('${SD}') as v`)).v).toBe(a);
    await as(null);
  });

  it("frees a claim after 15 minutes", async () => {
    await db.exec(`update public.call_contacts set claimed_at = now() - interval '16 minutes' where company = 'Kibo'`);
    await as(U2);
    const k = (await one<{ id: string }>(`select id from public.call_contacts where company = 'Kibo'`)).id;
    expect((await one<{ ok: boolean }>(`select public.claim_call('${k}') as ok`)).ok).toBe(true);
    // Taking Kibo let go of Twiga.
    const tw = await one<{ claimed_by: string | null }>(`select claimed_by from public.call_contacts where company = 'Twiga'`);
    expect(tw.claimed_by).toBeNull();
    await as(null);
  });
});

describe("outcomes", () => {
  it("no answer → tomorrow 09:00 EAT, third try → unreachable", async () => {
    const k = (await one<{ id: string }>(`select id from public.call_contacts where company = 'Kibo'`)).id;
    await as(U2);
    expect((await one<{ s: string }>(`select public.log_call('${k}', 'no_answer', 'rang out') as s`)).s).toBe("retry");
    const r = await one<{ attempts: number; hour: number; claimed_by: string | null; tomorrow: boolean }>(`
      select attempts, extract(hour from next_call_at at time zone 'UTC')::int as hour, claimed_by,
             ((next_call_at at time zone 'UTC') + interval '3 hours')::date = ((now() at time zone 'UTC') + interval '3 hours')::date + 1 as tomorrow
        from public.call_contacts where id = '${k}'`);
    expect(r).toMatchObject({ attempts: 1, hour: 6, claimed_by: null, tomorrow: true });
    // Not due yet, so it isn't handed out today.
    const next = (await one<{ v: string }>(`select public.claim_next_call('${SD}') as v`)).v;
    expect(next).not.toBe(k);
    await db.exec(`select public.log_call('${k}', 'no_answer'); select public.log_call('${k}', 'no_answer');`);
    expect((await one<{ status: string; attempts: number }>(`select status, attempts from public.call_contacts where id = '${k}'`))).toMatchObject({ status: "unreachable", attempts: 3 });
    expect((await one<{ n: number }>(`select count(*)::int as n from public.call_logs where contact_id = '${k}'`)).n).toBe(3);
    await as(null);
  });

  it("call back needs a future time; due call backs come first", async () => {
    const t = (await one<{ id: string }>(`select id from public.call_contacts where company = 'Twiga'`)).id;
    await as(U2); // U2 was handed Twiga in the test above
    await expect(db.exec(`select public.log_call('${t}', 'callback')`)).rejects.toThrow(/future/);
    await db.exec(`select public.log_call('${t}', 'callback', 'owner away', now() + interval '1 hour')`);
    await as(null);
    await db.exec(`update public.call_contacts set next_call_at = now() - interval '1 minute' where id = '${t}'`);
    await as(U1);
    expect((await one<{ v: string }>(`select public.claim_next_call('${SD}') as v`)).v).toBe(t);
    await as(null);
  });

  it("not interested can go on Do not call; Do not call clears other lists", async () => {
    const t = (await one<{ id: string }>(`select id from public.call_contacts where company = 'Twiga'`)).id;
    await db.exec(`insert into public.call_lists (id, client_id, name) values ('00000000-0000-0000-0000-0000000000e2', '${SD}', 'Second list');
      insert into public.call_contacts (client_id, list_id, company, phone) values ('${SD}', '00000000-0000-0000-0000-0000000000e2', 'Twiga copy', '+255754000002');`);
    await as(U1);
    expect((await one<{ s: string }>(`select public.log_call('${t}', 'not_interested', null, null, true) as s`)).s).toBe("dnc");
    await as(null);
    expect((await one<{ n: number }>(`select count(*)::int as n from public.call_dnc where phone = '+255754000002'`)).n).toBe(1);
    expect((await one<{ status: string }>(`select status from public.call_contacts where company = 'Twiga copy'`)).status).toBe("dnc");
  });
});

describe("country", () => {
  it("can take the next number from one country only", async () => {
    await db.exec(`insert into public.call_contacts (client_id, list_id, company, phone, country) values
      ('${SD}', '${L}', 'Nairobi Tours', '+254712000001', 'Kenya'), ('${SD}', '${L}', 'Moshi Treks', '+255754000009', 'Tanzania')`);
    await as(U1);
    const v = (await one<{ v: string }>(`select public.claim_next_call('${SD}', null, null, 'Kenya') as v`)).v;
    expect(await company(v)).toBe("Nairobi Tours");
    const t = (await one<{ v: string }>(`select public.claim_next_call('${SD}', null, null, 'Tanzania') as v`)).v;
    expect(await company(t)).toBe("Moshi Treks");
    await db.exec(`select public.release_calls('${SD}')`);
    await as(null);
  });
});

describe("access", () => {
  it("a normal client sees nothing and can't claim", async () => {
    await as(UX);
    expect(await q(`select * from public.call_contacts`)).toHaveLength(0);
    expect(await q(`select * from public.call_lists`)).toHaveLength(0);
    await expect(db.exec(`select public.claim_next_call('${SD}')`)).rejects.toThrow(/Not allowed/);
    await expect(db.exec(`insert into public.call_lists (client_id, name) values ('${GT}', 'Mine')`)).rejects.toThrow();
    await as(null);
  });
  it("the internal team sees its own lists", async () => {
    await as(U2);
    expect((await q(`select * from public.call_lists`)).length).toBe(2);
    await as(null);
  });
});
