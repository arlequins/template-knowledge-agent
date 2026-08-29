import assert from "node:assert/strict";
import test from "node:test";

import {
  parseQualificationArgs,
  qualificationSteps,
  runQualification,
} from "./derived-qualification.mjs";

test("qualification defaults to doctor and deterministic public checks", () => {
  const steps = qualificationSteps();
  assert.equal(steps[0].name, "template doctor");
  assert.equal(steps.at(-1).name, "template initialization");
});

test("full qualification appends the complete test suite", () => {
  assert.equal(
    qualificationSteps({ full: true }).at(-1).name,
    "full test suite",
  );
  assert.deepEqual(parseQualificationArgs(["--full", "--skip-doctor"]), {
    full: true,
    skipDoctor: true,
  });
});

test("qualification stops at the first failed command", () => {
  const commands = [];
  assert.throws(
    () =>
      runQualification({
        args: ["--skip-doctor"],
        exec(_command, commandArgs) {
          commands.push(commandArgs[0]);
          return { status: commandArgs[0] === "pilot:verify" ? 1 : 0 };
        },
        log() {},
      }),
    /Qualification failed: synthetic pilot/,
  );
  assert.deepEqual(commands, ["pilot:verify"]);
});
