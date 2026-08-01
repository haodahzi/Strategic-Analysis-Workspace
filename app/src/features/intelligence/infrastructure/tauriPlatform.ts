import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  FetchSnapshotResult,
  IntelligenceHealth,
  IntelligencePlatform,
} from "../domain/platform";

export type Invoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function createTauriPlatform(
  invoke: Invoke = tauriInvoke,
): IntelligencePlatform {
  return {
    health: () => invoke<IntelligenceHealth>("intelligence_health"),
    fetchSnapshot: ({ sourceId }) =>
      invoke<FetchSnapshotResult>("fetch_source_snapshot", {
        request: { sourceId },
      }),
  };
}

export const tauriPlatform = createTauriPlatform();
