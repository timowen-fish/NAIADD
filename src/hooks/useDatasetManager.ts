import {
  useCallback,
  useEffect,
  useState,
} from "react";
import DatasetManager, {
  type DatasetManagerDiagnostics,
  type DatasetManagerEvent,
  type DatasetManagerStatus,
} from "../services/datasetManager";

export type UseDatasetManagerOptions = {
  initializeOnMount?: boolean;
};

export type UseDatasetManagerResult = {
  status: DatasetManagerStatus;
  diagnostics: DatasetManagerDiagnostics;
  isReady: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
};

export function useDatasetManager(
  options: UseDatasetManagerOptions = {},
): UseDatasetManagerResult {
  const { initializeOnMount = true } = options;

  const [status, setStatus] = useState<DatasetManagerStatus>(
    DatasetManager.getStatus(),
  );
  const [diagnostics, setDiagnostics] =
    useState<DatasetManagerDiagnostics>(
      DatasetManager.getDiagnostics(),
    );
  const [error, setError] = useState(
    DatasetManager.getDiagnostics().lastError,
  );

  const syncFromManager = useCallback(
    (event?: DatasetManagerEvent) => {
      const nextDiagnostics =
        event?.diagnostics ??
        DatasetManager.getDiagnostics();

      setStatus(nextDiagnostics.status);
      setDiagnostics(nextDiagnostics);
      setError(
        event?.error?.message ??
          nextDiagnostics.lastError ??
          "",
      );
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = DatasetManager.subscribe(
      syncFromManager,
    );

    syncFromManager();

    if (initializeOnMount && !DatasetManager.isReady()) {
      void DatasetManager.initialize().catch(() => {
        // The manager emits the error event.
      });
    }

    return unsubscribe;
  }, [initializeOnMount, syncFromManager]);

  const initialize = useCallback(
    () => DatasetManager.initialize(),
    [],
  );

  const refresh = useCallback(
    () => DatasetManager.refresh(),
    [],
  );

  const clear = useCallback(() => {
    DatasetManager.clear();
  }, []);

  return {
    status,
    diagnostics,
    isReady: status === "ready",
    isLoading: status === "loading",
    isRefreshing: status === "refreshing",
    error,
    initialize,
    refresh,
    clear,
  };
}

export default useDatasetManager;
