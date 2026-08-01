export interface IntelligenceHealth {
  ready: boolean;
  schemaVersion: number;
  dataDir: string;
}

export interface FetchSnapshotRequest {
  sourceId: string;
}

export interface FetchSnapshotResult {
  finalUrl: string;
  status: number;
  contentType: string;
  contentHash: string;
  snapshotPath: string;
  fetchedAt: string;
}

export interface IntelligencePlatform {
  health(): Promise<IntelligenceHealth>;
  fetchSnapshot(request: FetchSnapshotRequest): Promise<FetchSnapshotResult>;
  listRecoverableRuns(): Promise<string[]>;
  markRunInterrupted(runId: string): Promise<void>;
  getLastSuccessfulSync(): Promise<string | null>;
}
