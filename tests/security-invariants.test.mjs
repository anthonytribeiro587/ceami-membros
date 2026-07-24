import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('runtime dependencies are pinned to patched versions', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.dependencies.next, '15.5.21');
  assert.equal(pkg.dependencies.react, '19.2.7');
  assert.equal(pkg.dependencies['@supabase/ssr'], '0.12.3');
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.110.8');
  for (const value of Object.values(pkg.dependencies)) {
    assert.doesNotMatch(String(value), /^[~^]/, 'production dependencies must be pinned');
  }
});

test('middleware fails closed and exposes only explicit public APIs', async () => {
  const middleware = await read('middleware.ts');
  assert.match(middleware, /return unavailable\(\)/);
  assert.doesNotMatch(middleware, /pathname\.startsWith\('\/api\/public\/'\)/);
  assert.match(middleware, /is_active/);
  assert.match(middleware, /\/api\/integra/);
});

test('birthday cron requires a database-backed bearer secret', async () => {
  const route = await read('app/api/birthdays/automatic/route.ts');
  assert.match(route, /hasValidBearer\(request, 'birthday_cron'\)/);
  assert.match(route, /status: 401/);
});


test('automation cron requires a database-backed bearer secret', async () => {
  const route = await read('app/api/automations/automatic/route.ts');
  assert.match(route, /hasValidBearer\(request, 'birthday_cron'\)/);
  assert.match(route, /status: 401/);
});

test('reading plan migration contains all 365 days and admin-only policies', async () => {
  const migration = await read('supabase/migrations/202607240001_automations_reading_plan.sql');
  const datedEntries = migration.match(/\('2026-\d{2}-\d{2}',/g) || [];
  assert.equal(datedEntries.length, 365);
  assert.match(migration, /public\.is_ceami_admin\(\)/);
  assert.match(migration, /ceami-automations/);
});

test('public service-role routes have rate limiting and body limits', async () => {
  const routes = [
    'app/api/integra/route.ts',
    'app/api/public/check-member/route.ts',
    'app/api/public/update-member/route.ts',
    'app/api/public/course-checkin/route.ts',
  ];

  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /consumeRateLimit/);
    assert.match(source, /readLimitedJson/);
  }
});

test('database hardening requires approved users and secures courses', async () => {
  const migration = await read('supabase/migrations/202607220001_production_hardening.sql');
  assert.match(migration, /is_active boolean not null default false/);
  assert.match(migration, /p\.role::text = 'admin' or p\.course_only = true/);
  assert.match(migration, /consume_api_rate_limit/);
  assert.match(migration, /prevent_future_lesson_completion/);
  assert.match(migration, /Authorization', 'Bearer/);
});

test('security headers prevent framing and indexing', async () => {
  const config = await read('next.config.ts');
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /noindex, nofollow/);
});
