import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { safetyVerdict } from '../../src/lib/safety-gate.ts';

const run = promisify(execFile);

/**
 * Honest gate runner. Runs the real suite and reports the TRUE totals. It never
 * claims a target number that is not produced by the runs below.
 */
export interface GateSummary {
  unit: { total: number; pass: number; fail: number };
  brand_leak: { pass: boolean; note: string };
  safe_mode: { pass: boolean; note: string };
  all_target_met: boolean;
  gate_basis: string;
}

export async function runGates(repoDir: string): Promise<GateSummary> {
  const unit = { total: 0, pass: 0, fail: 0 };
  let unitOut = '';
  try {
    const { stdout } = await run('npm', ['test'], { cwd: repoDir, timeout: 240000 });
    unitOut = stdout;
    const m = stdout.match(/# (?:tests|pass|fail)\s+(\d+)/g) ?? [];
    const nums = m.map((x) => Number(x.split(' ').pop()));
    unit.total = nums[0] ?? 0;
    unit.pass = nums[1] ?? 0;
    unit.fail = nums[2] ?? 0;
  } catch (e: any) {
    unitOut = String(e?.stdout ?? e?.message ?? e);
    const m = unitOut.match(/# (?:tests|pass|fail)\s+(\d+)/g) ?? [];
    const nums = m.map((x) => Number(x.split(' ').pop()));
    unit.total = nums[0] ?? 0;
    unit.pass = nums[1] ?? 0;
    unit.fail = nums[2] ?? Number((e?.code ?? 0) !== 0 ? -1 : 0);
  }

  const brand_leak = await runNode(path.join(repoDir, 'scripts', 'verify-no-leak.mjs'), repoDir);
  const safe_mode = await runNode(path.join(repoDir, 'scripts', 'verify-safe-mode.mjs'), repoDir);

  const allPassed = unit.fail === 0 && brand_leak && safe_mode;
  return {
    unit,
    brand_leak: { pass: brand_leak, note: brand_leak ? 'no brand leak tokens' : 'brand scan failed' },
    safe_mode: { pass: safe_mode, note: safe_mode ? 'clean shield behaves' : 'safe-mode check failed' },
    all_target_met: allPassed,
    gate_basis: `unit=${unit.pass}/${unit.total}; brand_leak=${brand_leak}; safe_mode=${safe_mode}`,
  };
}

async function runNode(file: string, cwd: string): Promise<boolean> {
  try {
    await run(process.execPath, [file], { cwd, timeout: 60000 });
    return true;
  } catch {
    return false;
  }
}

/** The single-merge guard. Only a designated merge judge may set this true. */
export function decideMerge(summary: GateSummary, mergeJudgeApproved: boolean): { merge: boolean; why: string } {
  if (!mergeJudgeApproved) return { merge: false, why: 'merge judge has not approved' };
  if (!summary.all_target_met) return { merge: false, why: summary.gate_basis };
  return { merge: true, why: `gates passed: ${summary.gate_basis}` };
}

export async function sampleSafetyGate(): Promise<void> {
  const ok = safetyVerdict('a 25-year-old woman, studio light, gentle scene');
  const bad = safetyVerdict('an image of a 15-year-old in school uniform');
  writeFileSync(path.join(process.cwd(), 'gates-sample.json'), JSON.stringify({ ok, bad }, null, 2));
  console.log('ok.pass', ok.pass, '| bad.pass', bad.pass);
}
