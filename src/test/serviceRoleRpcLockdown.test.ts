import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRpcCallerScope } from "../../supabase/functions/_shared/entitlementGuard.ts";

const lockMigrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703140000_lock_service_role_rpcs.sql"),
  "utf8",
);

const SERVICE_ROLE_ONLY = [
  "redeem_one_time_credit_for_run(uuid, text)",
  "consume_one_time_credit_for_user(uuid)",
  "increment_run_count_for_user(uuid)",
  "_consume_one_time_purchase_credit(uuid)",
  "_increment_run_count_for_user(uuid)",
] as const;

const AUTHENTICATED_ONLY = [
  "consume_one_time_credit()",
  "consume_one_time_credit(uuid)",
  "increment_run_count(uuid)",
] as const;

function grantBlock(fnSignature: string): string {
  const escaped = fnSignature.replace(/[()]/g, "\\$&");
  const match = lockMigrationSql.match(
    new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${escaped.replace(/\./g, "\\.")}[\\s\\S]*?(?=REVOKE ALL ON FUNCTION|CREATE OR REPLACE FUNCTION|-- ──|$)`,
    ),
  );
  return match?.[0] ?? "";
}

describe("Phase 10.5C — service-role RPC lockdown migration", () => {
  it("defines _assert_service_role_caller helper", () => {
    expect(lockMigrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\._assert_service_role_caller\(\)/);
    expect(lockMigrationSql).toMatch(/auth\.jwt\(\) ->> 'role'/);
  });

  for (const fn of SERVICE_ROLE_ONLY) {
    it(`${fn} revokes PUBLIC, anon, authenticated and grants service_role only`, () => {
      expect(lockMigrationSql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} FROM PUBLIC`),
      );
      expect(lockMigrationSql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} FROM anon`),
      );
      expect(lockMigrationSql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} FROM authenticated`),
      );
      if (
        fn !== "_consume_one_time_purchase_credit(uuid)" &&
        fn !== "_increment_run_count_for_user(uuid)"
      ) {
        expect(lockMigrationSql).toMatch(
          new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} TO service_role`),
        );
      }
    });
  }

  for (const fn of ["redeem_one_time_credit_for_run", "consume_one_time_credit_for_user", "increment_run_count_for_user"]) {
    it(`${fn} calls _assert_service_role_caller`, () => {
      const body = lockMigrationSql.split(`FUNCTION public.${fn}`)[1] ?? "";
      expect(body).toMatch(/PERFORM public\._assert_service_role_caller\(\)/);
    });
  }

  for (const fn of AUTHENTICATED_ONLY) {
    it(`${fn} revokes anon and grants authenticated only`, () => {
      expect(lockMigrationSql).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} FROM anon`),
      );
      expect(lockMigrationSql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} TO authenticated`),
      );
      expect(lockMigrationSql).not.toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/g, "\\$&")} TO anon`),
      );
    });
  }

  it("user wrappers reject cross-user id via auth.uid() check", () => {
    expect(lockMigrationSql).toMatch(/p_user_id IS DISTINCT FROM auth\.uid\(\)/);
    expect(validateRpcCallerScope("user-a", "user-b")).toBe(false);
    expect(validateRpcCallerScope("user-a", "user-a")).toBe(true);
  });

  it("increment_run_count authenticated wrapper uses internal helper not service-role RPC", () => {
    const wrapper = lockMigrationSql.split("FUNCTION public.increment_run_count(p_user_id uuid)")[1] ?? "";
    expect(wrapper).toMatch(/PERFORM public\._increment_run_count_for_user\(auth\.uid\(\)\)/);
    expect(wrapper).not.toMatch(/PERFORM public\.increment_run_count_for_user/);
  });
});

/**
 * SQL verification (run after applying migration on linked project):
 *
 * -- 1) service-role-only functions: EXECUTE only for service_role
 * SELECT routine_name, grantee, privilege_type
 * FROM information_schema.role_routine_grants
 * WHERE specific_schema = 'public'
 *   AND routine_name IN (
 *     'redeem_one_time_credit_for_run',
 *     'consume_one_time_credit_for_user',
 *     'increment_run_count_for_user',
 *     '_consume_one_time_purchase_credit',
 *     '_increment_run_count_for_user'
 *   )
 * ORDER BY routine_name, grantee;
 *
 * -- 2–3) anon/authenticated cannot execute redeem (expect permission denied)
 * SET ROLE anon;
 * SELECT public.redeem_one_time_credit_for_run(
 *   '00000000-0000-4000-8000-000000000001'::uuid, 'test-fingerprint'
 * );
 * RESET ROLE;
 *
 * -- 4) authenticated can execute consume_one_time_credit()
 * -- (requires signed-in JWT in Supabase client, not raw SET ROLE)
 *
 * -- 5–6) cross-user rejection (authenticated session)
 * SELECT public.consume_one_time_credit('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
 * SELECT public.increment_run_count('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
 */
