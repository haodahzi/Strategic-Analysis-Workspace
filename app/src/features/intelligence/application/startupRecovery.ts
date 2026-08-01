import type { IntelligencePlatform } from "../domain/platform";

export interface StartupRecovery {
  interruptedRunIds: string[];
  catchUpFrom: string | null;
  catchUpTo: string;
}

export async function recoverOnStartup(
  platform: IntelligencePlatform,
  now: () => Date,
): Promise<StartupRecovery> {
  const health = await platform.health();
  if (!health.ready) {
    throw new Error("database_unavailable");
  }

  const interruptedRunIds = await platform.listRecoverableRuns();
  for (const runId of interruptedRunIds) {
    await platform.markRunInterrupted(runId);
  }
  const catchUpFrom = await platform.getLastSuccessfulSync();

  return {
    interruptedRunIds,
    catchUpFrom,
    catchUpTo: now().toISOString(),
  };
}
