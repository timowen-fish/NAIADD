"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDatasetManager = useDatasetManager;
const react_1 = require("react");
const datasetManager_1 = __importDefault(require("../services/datasetManager"));
function useDatasetManager(options = {}) {
    const { initializeOnMount = true } = options;
    const [status, setStatus] = (0, react_1.useState)(datasetManager_1.default.getStatus());
    const [diagnostics, setDiagnostics] = (0, react_1.useState)(datasetManager_1.default.getDiagnostics());
    const [error, setError] = (0, react_1.useState)(datasetManager_1.default.getDiagnostics().lastError);
    const syncFromManager = (0, react_1.useCallback)((event) => {
        const nextDiagnostics = event?.diagnostics ??
            datasetManager_1.default.getDiagnostics();
        setStatus(nextDiagnostics.status);
        setDiagnostics(nextDiagnostics);
        setError(event?.error?.message ??
            nextDiagnostics.lastError ??
            "");
    }, []);
    (0, react_1.useEffect)(() => {
        const unsubscribe = datasetManager_1.default.subscribe(syncFromManager);
        syncFromManager();
        if (initializeOnMount && !datasetManager_1.default.isReady()) {
            void datasetManager_1.default.initialize().catch(() => {
                // The manager emits the error event.
            });
        }
        return unsubscribe;
    }, [initializeOnMount, syncFromManager]);
    const initialize = (0, react_1.useCallback)(() => datasetManager_1.default.initialize(), []);
    const refresh = (0, react_1.useCallback)(() => datasetManager_1.default.refresh(), []);
    const clear = (0, react_1.useCallback)(() => {
        datasetManager_1.default.clear();
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
exports.default = useDatasetManager;
//# sourceMappingURL=useDatasetManager.js.map