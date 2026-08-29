#!/usr/bin/env node

import { spawnSync } from "node:child_process";

/** The safe, deterministic checks every repository created from this template should run. */
export const QUALIFICATION_STEPS = Object.freeze([
  { args: ["pilot:verify"], name: "synthetic pilot" },
  { args: ["tuning:patterns:verify"], name: "reviewed behavior pack" },
  { args: ["architecture:check"], name: "architecture boundaries" },
  { args: ["check"], name: "format and lint" },
  { args: ["typecheck"], name: "typecheck" },
  { args: ["test:template-init"], name: "template initialization" },
]);

export function parseQualificationArgs(args) {
  const options = { full: false, skipDoctor: false };
  for (const argument of args) {
    // Accept the conventional `pnpm run ... -- --flag` separator as well as
    // direct `pnpm ... --flag` invocation.
    if (argument === "--") continue;
    if (argument === "--full") options.full = true;
    else if (argument === "--skip-doctor") options.skipDoctor = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function qualificationSteps(options = {}) {
  const steps = [...QUALIFICATION_STEPS];
  if (!options.skipDoctor)
    steps.unshift({
      args: ["template:doctor", "--", "--strict"],
      name: "template doctor",
    });
  if (options.full) steps.push({ args: ["test"], name: "full test suite" });
  return steps;
}

export function runQualification({
  args = [],
  cwd = process.cwd(),
  exec = spawnSync,
  log = console.log,
} = {}) {
  const options = parseQualificationArgs(args);
  const results = [];
  for (const step of qualificationSteps(options)) {
    log(`\n[qualification] ${step.name}`);
    const result = exec("pnpm", step.args, {
      cwd,
      encoding: "utf8",
      stdio: "inherit",
    });
    const passed = result.status === 0;
    results.push({ name: step.name, passed });
    if (!passed) {
      const error = new Error(`Qualification failed: ${step.name}`);
      error.step = step.name;
      error.results = results;
      throw error;
    }
  }
  return { options, results };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = runQualification({ args: process.argv.slice(2) });
    console.log(`\nQualification passed (${result.results.length} checks).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
