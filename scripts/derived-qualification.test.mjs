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
  assert.deepEqual(
    steps.slice(-3).map(({ args, name }) => ({ args, name })),
    [
      { args: ["test:template-init"], name: "template initialization" },
      {
        args: ["test:integration-reference"],
        name: "synthetic integration reference",
      },
      {
        args: ["integration:qualify", "--", "--strict"],
        name: "privacy and weight-training integration qualifiers",
      },
    ],
  );
  assert.deepEqual(
    steps.find(({ name }) => name === "public API compatibility"),
    { args: ["check:public-api"], name: "public API compatibility" },
  );
  assert.equal(
    steps.at(-1).name,
    "privacy and weight-training integration qualifiers",
  );
});

test("full qualification appends the complete test suite", () => {
  assert.equal(
    qualificationSteps({ full: true }).at(-1).name,
    "full test suite",
  );
  assert.deepEqual(
    parseQualificationArgs(["--full", "--skip-doctor", "--skip-integrations"]),
    {
      full: true,
      skipDoctor: true,
      skipIntegrations: true,
    },
  );
  assert.deepEqual(parseQualificationArgs(["--", "--full"]), {
    full: true,
    skipDoctor: false,
    skipIntegrations: false,
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
