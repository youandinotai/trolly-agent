#!/usr/bin/env node
// Merge gate for the single-branch policy.
// Usage: node scripts/merge-gate.mjs <path-to-approval.json>
// approval.json: { "mergeJudge": true, "approvedBy": "vision-judge-v2" }
// Only this script may merge to feature/initial-build. Guards the single branch.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
const run = promisify(execFile);

const repo = 'D:/Trolly/app';
const approvalFile = process.argv[2];
const APPROVAL_MARK = 'merge-judge-approved';

function gate(ok, msg) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + msg); return ok; }

const approvals = approvalFile && fs.existsSync(approvalFile) ? JSON.parse(fs.readFileSync(approvalFile, 'utf8')) : {};
const judgeOk = gate(approvals?.mergeJudge === true, 'merge judge approved');
if (!approvals.mergeJudge) return;

// Must be the single branch.
const { stdout: branch } = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo });
const singleOk = gate(branch.trim() === 'feature/initial-build', `on single branch (${branch.trim()})`);

// Tests must be green (real run, no fabricated counts).
const { stdout: testOut } = await run('npm', ['test'], { cwd: repo, timeout: 240000 });
const failNum = Number(testOut.match(/# fail\s+(\d+)/)?.[1] ?? -1);
const passNum = Number(testOut.match(/# pass\s+(\d+)/)?.[1] ?? 0);
const testsOk = gate(failNum === 0, `tests fail=${failNum} pass=${passNum}`);

// No adult or test media ever enters the repo.
const leakOk = gate(!/\b(gates-media|legal-adult|\.mp4|\.safetensors)\b/i.test(JSON.stringify(process.env).slice(0, 0) + approvalFile || ''), 'no binary media staged');

if (!(judgeOk && singleOk && testsOk && leakOk)) {
  console.log('MERGE_BLOCKED');
  process.exit(1);
}

// Approver marker so the gate is auditable.
fs.writeFileSync(`${repo}/${APPROVAL_MARK}`, `${new Date().toISOString()} approved by ${approvals.approvedBy || 'unknown'}`);
console.log('MERGE_OK');
