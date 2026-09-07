import {
  createSyntheticExactPersonalDataConformanceAdapter,
  runExactPersonalDataConformance,
} from "../../packages/agent-core/src/index";
import {
  createSyntheticWeightTrainingConformanceHarness,
  runWeightTrainingConformanceSuite,
} from "../../packages/tuning-kit/src/index";

export async function runSyntheticReference() {
  const privacy = await runExactPersonalDataConformance(
    createSyntheticExactPersonalDataConformanceAdapter(),
  );
  const weightTraining = await runWeightTrainingConformanceSuite(
    createSyntheticWeightTrainingConformanceHarness(),
  );
  return Object.freeze({
    passed: privacy.passed && weightTraining.passed,
    privacy,
    weightTraining,
  });
}
