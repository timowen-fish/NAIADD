"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CPUEPage;
const react_1 = require("react");
const queryDataSessionService_1 = require("../services/queryDataSessionService");
const analysisEngine_1 = require("../services/analysisEngine");
require("../styles/CPUEPage.css");
const GROUPING_OPTIONS = [
    { value: "overall", label: "All selected collections combined" },
    { value: "collection", label: "Each collection" },
    { value: "species", label: "Species" },
    { value: "waterbody", label: "Waterbody" },
    { value: "year", label: "Year" },
    { value: "month", label: "Month" },
    { value: "surveyor", label: "Surveyor" },
];
const VISUAL_METRICS = [
    { value: "cpue", label: "Overall CPUE" },
    { value: "cpueS", label: "CPUE-S" },
    { value: "cpueQ", label: "CPUE-Q" },
    { value: "cpueP", label: "CPUE-P" },
    { value: "cpueM", label: "CPUE-M" },
    { value: "cpueT", label: "CPUE-T" },
];
function groupingLabel(grouping) {
    return GROUPING_OPTIONS.find((option) => option.value === grouping)?.label ?? grouping;
}
function compareGroupValues(left, right) {
    const yearPattern = /^\d{4}$/;
    const monthPattern = /^\d{4}-\d{2}$/;
    if ((yearPattern.test(left) && yearPattern.test(right)) ||
        (monthPattern.test(left) && monthPattern.test(right))) {
        return left.localeCompare(right);
    }
    return left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
    });
}
function chartSeriesClass(index) {
    return `cpue-chart-series-${index % 8}`;
}
const EFFORT_OPTIONS = [
    {
        value: "hour",
        label: "Per Hour",
        inputUnit: "hours",
        outputUnit: "fish/hour",
    },
    {
        value: "net_night",
        label: "Per Net-Night",
        inputUnit: "net-nights",
        outputUnit: "fish/net-night",
    },
    {
        value: "kilometer",
        label: "Per Kilometer",
        inputUnit: "meters sampled",
        outputUnit: "fish/km",
    },
];
function formatDate(value) {
    const parsed = new Date(value);
    return value && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : "Not available";
}
function formatNumber(value, digits = 2) {
    return value != null && Number.isFinite(value)
        ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
        : "—";
}
function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
}
function detectedForMethod(item, method) {
    if (method === "hour")
        return item.detectedHour;
    if (method === "net_night")
        return item.detectedNetNight;
    return item.detectedDistanceMeters;
}
function chooseDefaultMethod(values) {
    const counts = { hour: 0, net_night: 0, kilometer: 0 };
    values.forEach((item) => {
        if (item.detectedHour != null)
            counts.hour += 1;
        if (item.detectedNetNight != null)
            counts.net_night += 1;
        if (item.detectedDistanceMeters != null)
            counts.kilometer += 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "hour";
}
function CPUEPage() {
    const [appliedQuery, setAppliedQuery] = (0, react_1.useState)(() => (0, queryDataSessionService_1.loadAppliedQueryData)());
    const [grouping, setGrouping] = (0, react_1.useState)("year");
    const [secondaryGrouping, setSecondaryGrouping] = (0, react_1.useState)("species");
    const [effortMethod, setEffortMethod] = (0, react_1.useState)("hour");
    const [effortValues, setEffortValues] = (0, react_1.useState)([]);
    const [effortOverrides, setEffortOverrides] = (0, react_1.useState)({});
    const [result, setResult] = (0, react_1.useState)(null);
    const [progress, setProgress] = (0, react_1.useState)(null);
    const [loadingEffort, setLoadingEffort] = (0, react_1.useState)(false);
    const [isCalculating, setIsCalculating] = (0, react_1.useState)(false);
    const [errorMessage, setErrorMessage] = (0, react_1.useState)("");
    const [showVisualization, setShowVisualization] = (0, react_1.useState)(false);
    const [visualMetric, setVisualMetric] = (0, react_1.useState)("cpue");
    const [chartType, setChartType] = (0, react_1.useState)("line");
    const [xDimension, setXDimension] = (0, react_1.useState)("primary");
    const [seriesLimit, setSeriesLimit] = (0, react_1.useState)(8);
    const abortControllerRef = (0, react_1.useRef)(null);
    const collectionIDs = appliedQuery?.collectionIDs ?? [];
    const hasAppliedQuery = collectionIDs.length > 0;
    const selectedOption = EFFORT_OPTIONS.find((option) => option.value === effortMethod);
    (0, react_1.useEffect)(() => {
        const refresh = () => setAppliedQuery((0, queryDataSessionService_1.loadAppliedQueryData)());
        window.addEventListener(queryDataSessionService_1.APPLIED_QUERY_DATA_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(queryDataSessionService_1.APPLIED_QUERY_DATA_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
    (0, react_1.useEffect)(() => () => abortControllerRef.current?.abort(), []);
    (0, react_1.useEffect)(() => {
        abortControllerRef.current?.abort();
        setResult(null);
        setEffortValues([]);
        setEffortOverrides({});
        setErrorMessage("");
        if (!hasAppliedQuery)
            return;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setLoadingEffort(true);
        setProgress({
            completedCollections: 0,
            totalCollections: collectionIDs.length,
            percentComplete: 0,
            currentCollectionID: "",
        });
        (0, analysisEngine_1.loadCollectionEfforts)(collectionIDs, controller.signal, setProgress)
            .then((values) => {
            if (controller.signal.aborted)
                return;
            const defaultMethod = chooseDefaultMethod(values);
            setEffortMethod(defaultMethod);
            setEffortValues(values);
            const defaults = {};
            values.forEach((item) => {
                const value = detectedForMethod(item, defaultMethod);
                if (value != null)
                    defaults[item.collectionID] = value;
            });
            setEffortOverrides(defaults);
        })
            .catch((error) => {
            if (!isAbortError(error))
                setErrorMessage(error instanceof Error ? error.message : String(error));
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setLoadingEffort(false);
        });
    }, [appliedQuery?.appliedAt]);
    function changeEffortMethod(next) {
        setEffortMethod(next);
        setResult(null);
        const defaults = {};
        effortValues.forEach((item) => {
            const value = detectedForMethod(item, next);
            if (value != null)
                defaults[item.collectionID] = value;
        });
        setEffortOverrides(defaults);
    }
    function updateEffort(collectionID, rawValue) {
        setResult(null);
        setEffortOverrides((current) => {
            const next = { ...current };
            if (rawValue.trim() === "")
                delete next[collectionID];
            else {
                const value = Number(rawValue);
                if (Number.isFinite(value))
                    next[collectionID] = value;
            }
            return next;
        });
    }
    function resetEffortValues() {
        const defaults = {};
        effortValues.forEach((item) => {
            const value = detectedForMethod(item, effortMethod);
            if (value != null)
                defaults[item.collectionID] = value;
        });
        setEffortOverrides(defaults);
        setResult(null);
    }
    const missingEffortCount = effortValues.filter((item) => {
        const value = effortOverrides[item.collectionID];
        return !Number.isFinite(value) || value <= 0;
    }).length;
    const summary = (0, react_1.useMemo)(() => {
        if (!result)
            return { collections: 0, fish: 0, effort: 0, groups: 0, cpue: 0 };
        const fish = result.metrics.reduce((sum, metric) => sum + metric.fish, 0);
        const effort = result.totalEffort;
        return {
            collections: result.collectionCount,
            fish,
            effort,
            groups: result.metrics.length,
            cpue: effort > 0 ? fish / effort : 0,
        };
    }, [result]);
    function csvCell(value) {
        const text = value == null ? "" : String(value);
        return `"${text.replace(/"/g, '""')}"`;
    }
    function exportCsv() {
        if (!result)
            return;
        const headers = [
            "Primary Group",
            "Secondary Group",
            "Collections",
            "Fish",
            `Effort (${effortMethod === "kilometer" ? "km" : selectedOption.inputUnit})`,
            `CPUE (${selectedOption.outputUnit})`,
            "Stock Fish+",
            "Quality Fish+",
            "Preferred Fish+",
            "Memorable Fish+",
            "Trophy Fish",
            "CPUE-S",
            "CPUE-Q",
            "CPUE-P",
            "CPUE-M",
            "CPUE-T",
            "Average Length",
            "Average Weight",
        ];
        const rows = result.metrics.map((metric) => [
            metric.primaryGroup,
            metric.secondaryGroup ?? "",
            metric.collections,
            metric.fish,
            metric.effort,
            metric.cpue,
            metric.stockFish,
            metric.qualityFish,
            metric.preferredFish,
            metric.memorableFish,
            metric.trophyFish,
            metric.cpueS ?? "",
            metric.cpueQ ?? "",
            metric.cpueP ?? "",
            metric.cpueM ?? "",
            metric.cpueT ?? "",
            metric.averageLength ?? "",
            metric.averageWeight ?? "",
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n");
        const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `VADMA_CPUE_${grouping}${secondaryGrouping === "none" ? "" : `_${secondaryGrouping}`}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }
    const chartModel = (0, react_1.useMemo)(() => {
        if (!result) {
            return {
                categories: [],
                series: [],
                maximum: 1,
            };
        }
        const hasSecondary = result.metrics.some((metric) => metric.secondaryGroup != null);
        const effectiveXDimension = xDimension === "secondary" && !hasSecondary
            ? "primary"
            : xDimension;
        const otherDimension = effectiveXDimension === "primary"
            ? "secondary"
            : "primary";
        const xValue = (metric) => effectiveXDimension === "primary"
            ? metric.primaryGroup
            : metric.secondaryGroup ?? "All";
        const seriesValue = (metric) => !hasSecondary
            ? "CPUE"
            : otherDimension === "primary"
                ? metric.primaryGroup
                : metric.secondaryGroup ?? "All";
        const categories = [
            ...new Set(result.metrics.map(xValue)),
        ].sort(compareGroupValues);
        const totals = new Map();
        result.metrics.forEach((metric) => {
            const value = metric[visualMetric];
            if (value == null || !Number.isFinite(value))
                return;
            const name = seriesValue(metric);
            totals.set(name, (totals.get(name) ?? 0) + value);
        });
        const seriesNames = [...totals.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, Math.max(1, seriesLimit))
            .map(([name]) => name);
        const valueLookup = new Map();
        result.metrics.forEach((metric) => {
            const value = metric[visualMetric];
            if (value == null || !Number.isFinite(value))
                return;
            valueLookup.set(`${xValue(metric)}\u001f${seriesValue(metric)}`, value);
        });
        const series = seriesNames.map((name) => ({
            name,
            values: categories.map((category) => valueLookup.get(`${category}\u001f${name}`) ?? null),
        }));
        const maximum = Math.max(1, ...series.flatMap((item) => item.values.filter((value) => value != null)));
        return { categories, series, maximum };
    }, [result, visualMetric, xDimension, seriesLimit]);
    const chartGeometry = (0, react_1.useMemo)(() => {
        const width = 1000;
        const height = 500;
        const margin = {
            top: 28,
            right: 24,
            bottom: 92,
            left: 76,
        };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const categoryCount = Math.max(1, chartModel.categories.length);
        const categoryStep = plotWidth / categoryCount;
        const y = (value) => margin.top +
            plotHeight -
            (value / chartModel.maximum) * plotHeight;
        return {
            width,
            height,
            margin,
            plotWidth,
            plotHeight,
            categoryStep,
            y,
        };
    }, [chartModel]);
    async function calculateMetrics() {
        if (!hasAppliedQuery || loadingEffort || isCalculating || missingEffortCount > 0)
            return;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsCalculating(true);
        setErrorMessage("");
        setResult(null);
        setProgress({ completedCollections: 0, totalCollections: collectionIDs.length, percentComplete: 0, currentCollectionID: "" });
        try {
            const calculated = await (0, analysisEngine_1.analyzeCollections)({
                collectionIDs,
                grouping,
                secondaryGrouping: secondaryGrouping === "none"
                    ? null
                    : secondaryGrouping,
                effortMethod,
                effortOverrides,
                signal: controller.signal,
                onProgress: setProgress,
            });
            if (!controller.signal.aborted)
                setResult(calculated);
        }
        catch (error) {
            if (isAbortError(error))
                setErrorMessage("Analysis cancelled.");
            else
                setErrorMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            if (!controller.signal.aborted)
                setIsCalculating(false);
        }
    }
    return (<section className="cpue-page" aria-labelledby="cpue-page-title">
      <header className="cpue-page-header">
        <div>
          <span className="cpue-page-eyebrow">Reports</span>
          <h1 id="cpue-page-title">CPUE Analysis</h1>
          <p>Combine all selected collections or report them separately, then calculate CPUE using editable effort values.</p>
        </div>
      </header>

      <section className="cpue-query-card">
        <div className="cpue-query-card-heading">
          <div><span>Current Query</span><strong>{hasAppliedQuery ? `${collectionIDs.length.toLocaleString()} collections ready` : "No applied query"}</strong></div>
          <span className={hasAppliedQuery ? "cpue-status-pill cpue-status-pill-ready" : "cpue-status-pill"}>{hasAppliedQuery ? "Ready" : "Query required"}</span>
        </div>
        <div className="cpue-query-stats">
          <div><span>Collections</span><strong>{collectionIDs.length.toLocaleString()}</strong></div>
          <div><span>Applied</span><strong>{formatDate(appliedQuery?.appliedAt ?? "")}</strong></div>
        </div>
      </section>

      <section className="cpue-settings-card">
        <div className="cpue-section-heading"><div><span>Analysis Setup</span><h2>Configure CPUE</h2></div></div>

        <div className="cpue-control-grid">
          <label className="cpue-field">
            <span>Primary grouping</span>
            <select value={grouping} disabled={isCalculating} onChange={(event) => {
            const next = event.target.value;
            setGrouping(next);
            if (secondaryGrouping === next) {
                setSecondaryGrouping("none");
            }
            setResult(null);
        }}>
              {GROUPING_OPTIONS.map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>

          <label className="cpue-field">
            <span>Split each group by</span>
            <select value={secondaryGrouping} disabled={isCalculating || grouping === "overall"} onChange={(event) => {
            setSecondaryGrouping(event.target.value);
            setResult(null);
        }}>
              <option value="none">No secondary grouping</option>
              {GROUPING_OPTIONS.filter((option) => option.value !== "overall" &&
            option.value !== grouping).map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>
        </div>

        <p className="cpue-grouping-note">
          Example: choose Year as the primary grouping and Species
          as the secondary grouping to calculate a separate annual
          CPUE trend for every species.
        </p>

        <fieldset className="cpue-effort-fieldset" disabled={loadingEffort || isCalculating}>
          <legend>CPUE effort unit</legend>
          {EFFORT_OPTIONS.map((option) => (<label key={option.value}>
              <input type="radio" name="cpue-effort-method" checked={effortMethod === option.value} onChange={() => changeEffortMethod(option.value)}/>
              <span><strong>{option.label}</strong><small>{option.outputUnit}</small></span>
            </label>))}
        </fieldset>

        {effortValues.length > 0 && (<div className="cpue-effort-editor">
            <div className="cpue-effort-editor-heading">
              <div><strong>Effort by collection</strong><span>Detected electrofishing effort is converted from seconds to hours. Edit any value before calculating; distance is converted from meters to kilometers afterward.</span></div>
              <button type="button" onClick={resetEffortValues} disabled={isCalculating}>Reset detected values</button>
            </div>
            <div className="cpue-effort-table-wrap">
              <table className="cpue-effort-table">
                <thead><tr><th>Collection ID</th><th>Detected effort</th><th>Effort ({selectedOption.inputUnit})</th></tr></thead>
                <tbody>
                  {effortValues.map((item) => {
                const detected = detectedForMethod(item, effortMethod);
                return (<tr key={item.collectionID}>
                        <th>{item.collectionID}</th>
                        <td>{formatNumber(detected ?? undefined)}</td>
                        <td><input type="number" min="0" step="any" value={effortOverrides[item.collectionID] ?? ""} onChange={(event) => updateEffort(item.collectionID, event.target.value)} aria-label={`Effort in ${selectedOption.inputUnit} for ${item.collectionID}`}/></td>
                      </tr>);
            })}
                </tbody>
              </table>
            </div>
            {missingEffortCount > 0 && <div className="cpue-effort-warning">Enter a positive effort value in {selectedOption.inputUnit} for {missingEffortCount} collection{missingEffortCount === 1 ? "" : "s"} before calculating.</div>}
          </div>)}

        <div className="cpue-action-panel">
          <div>
            <strong>{loadingEffort ? "Reading effort values" : isCalculating ? "Calculating metrics" : result ? "Metrics are ready" : "Ready to calculate"}</strong>
            <span>{loadingEffort ? "Checking each selected collection for available effort fields." : "CPUE uses the editable effort values shown above."}</span>
          </div>
          <div className="cpue-action-buttons">
            {(loadingEffort || isCalculating) && <button type="button" className="cpue-cancel-button" onClick={() => abortControllerRef.current?.abort()}>Cancel</button>}
            <button type="button" className="cpue-calculate-button" disabled={!hasAppliedQuery || loadingEffort || isCalculating || missingEffortCount > 0} onClick={calculateMetrics}>{isCalculating ? "Calculating…" : result ? "Recalculate Metrics" : "Calculate Metrics"}</button>
          </div>
        </div>

        {progress && (<div className="cpue-progress-panel" aria-live="polite">
            <div className="cpue-progress-heading"><strong>{progress.percentComplete}% complete</strong><span>{progress.completedCollections} of {progress.totalCollections} collections</span></div>
            <div className="cpue-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentComplete}><div className="cpue-progress-fill" style={{ width: `${progress.percentComplete}%` }}/></div>
          </div>)}
        {errorMessage && <div className="cpue-error-message" role="alert">{errorMessage}</div>}
      </section>

      {result && (<>
          <section className="cpue-summary-grid">
            <article><span>Collections</span><strong>{summary.collections.toLocaleString()}</strong></article>
            <article><span>Total Fish</span><strong>{formatNumber(summary.fish, 0)}</strong></article>
            <article><span>Total Effort ({effortMethod === "kilometer" ? "km" : selectedOption.inputUnit})</span><strong>{formatNumber(summary.effort)}</strong></article>
            <article><span>Overall CPUE ({selectedOption.outputUnit})</span><strong>{formatNumber(summary.cpue)}</strong></article>
            <article><span>Result Groups</span><strong>{summary.groups.toLocaleString()}</strong></article>
          </section>
          <section className="cpue-results-card">
            <div className="cpue-results-heading"><div><span>Results</span><h2>CPUE Metrics — {selectedOption.label}</h2></div><div className="cpue-results-actions"><small>Generated {formatDate(result.generatedAt)}</small><button type="button" onClick={exportCsv}>Export CSV</button><button type="button" className="cpue-visualize-button" onClick={() => setShowVisualization(true)}>Visualize</button></div></div>
            <div className="cpue-table-wrap">
              <table className="cpue-results-table">
                <thead><tr><th>{groupingLabel(grouping)}</th>{secondaryGrouping !== "none" && <th>{groupingLabel(secondaryGrouping)}</th>}<th>Collections</th><th>Fish</th><th>Effort ({effortMethod === "kilometer" ? "km" : selectedOption.inputUnit})</th><th>CPUE ({selectedOption.outputUnit})</th><th>CPUE-S</th><th>CPUE-Q</th><th>CPUE-P</th><th>CPUE-M</th><th>CPUE-T</th><th>Avg. Length</th><th>Avg. Weight</th></tr></thead>
                <tbody>{result.metrics.map((metric) => <tr key={`${metric.primaryGroup}-${metric.secondaryGroup ?? ""}`}><th>{metric.primaryGroup}</th>{secondaryGrouping !== "none" && <th>{metric.secondaryGroup ?? "—"}</th>}<td>{metric.collections}</td><td>{formatNumber(metric.fish, 0)}</td><td>{formatNumber(metric.effort)}</td><td><strong>{formatNumber(metric.cpue)}</strong></td><td>{formatNumber(metric.cpueS ?? undefined)}</td><td>{formatNumber(metric.cpueQ ?? undefined)}</td><td>{formatNumber(metric.cpueP ?? undefined)}</td><td>{formatNumber(metric.cpueM ?? undefined)}</td><td>{formatNumber(metric.cpueT ?? undefined)}</td><td>{formatNumber(metric.averageLength)}</td><td>{formatNumber(metric.averageWeight)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>)}

      {showVisualization && result && (<div className="cpue-visualization-backdrop" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    setShowVisualization(false);
                }
            }}>
          <section className="cpue-visualization-modal" role="dialog" aria-modal="true" aria-labelledby="cpue-visualization-title">
            <div className="cpue-visualization-header">
              <div>
                <span>Data Visualization</span>
                <h2 id="cpue-visualization-title">
                  CPUE Trend Builder
                </h2>
                <p>
                  Choose the metric, chart type, horizontal axis,
                  and number of series shown.
                </p>
              </div>
              <button type="button" className="cpue-visualization-close" onClick={() => setShowVisualization(false)} aria-label="Close visualization">
                ×
              </button>
            </div>

            <div className="cpue-visualization-controls">
              <label>
                <span>Metric</span>
                <select value={visualMetric} onChange={(event) => setVisualMetric(event.target.value)}>
                  {VISUAL_METRICS.map((option) => (<option key={option.value} value={option.value}>
                      {option.label}
                    </option>))}
                </select>
              </label>

              <label>
                <span>Chart type</span>
                <select value={chartType} onChange={(event) => setChartType(event.target.value)}>
                  <option value="line">Line trend</option>
                  <option value="bar">Grouped bars</option>
                </select>
              </label>

              <label>
                <span>Horizontal axis</span>
                <select value={xDimension} disabled={secondaryGrouping === "none"} onChange={(event) => setXDimension(event.target.value)}>
                  <option value="primary">
                    {groupingLabel(grouping)}
                  </option>
                  {secondaryGrouping !== "none" && (<option value="secondary">
                      {groupingLabel(secondaryGrouping)}
                    </option>)}
                </select>
              </label>

              <label>
                <span>Maximum series</span>
                <select value={seriesLimit} onChange={(event) => setSeriesLimit(Number(event.target.value))}>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={12}>12</option>
                  <option value={50}>All available</option>
                </select>
              </label>
            </div>

            <div className="cpue-chart-legend">
              {chartModel.series.map((series, index) => (<span key={series.name}>
                  <i className={chartSeriesClass(index)}/>
                  {series.name}
                </span>))}
            </div>

            <div className="cpue-chart-shell">
              {chartModel.categories.length === 0 ||
                chartModel.series.length === 0 ? (<div className="cpue-histogram-empty">
                  No values are available for this configuration.
                </div>) : (<svg className="cpue-chart" viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} role="img" aria-label={`${VISUAL_METRICS.find((item) => item.value === visualMetric)?.label ?? "CPUE"} chart`}>
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const value = chartModel.maximum * (1 - fraction);
                    const y = chartGeometry.margin.top +
                        chartGeometry.plotHeight * fraction;
                    return (<g key={fraction}>
                        <line className="cpue-chart-grid" x1={chartGeometry.margin.left} x2={chartGeometry.margin.left +
                            chartGeometry.plotWidth} y1={y} y2={y}/>
                        <text className="cpue-chart-y-label" x={chartGeometry.margin.left - 12} y={y + 4} textAnchor="end">
                          {formatNumber(value)}
                        </text>
                      </g>);
                })}

                  {chartModel.categories.map((category, categoryIndex) => {
                    const x = chartGeometry.margin.left +
                        chartGeometry.categoryStep *
                            (categoryIndex + 0.5);
                    return (<text key={category} className="cpue-chart-x-label" x={x} y={chartGeometry.height -
                            chartGeometry.margin.bottom +
                            24} textAnchor="end" transform={`rotate(-35 ${x} ${chartGeometry.height -
                            chartGeometry.margin.bottom +
                            24})`}>
                          {category}
                        </text>);
                })}

                  {chartType === "line"
                    ? chartModel.series.map((series, seriesIndex) => {
                        const points = series.values
                            .map((value, categoryIndex) => {
                            if (value == null)
                                return null;
                            return {
                                x: chartGeometry.margin.left +
                                    chartGeometry.categoryStep *
                                        (categoryIndex + 0.5),
                                y: chartGeometry.y(value),
                                value,
                            };
                        })
                            .filter((point) => point != null);
                        const path = points
                            .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
                            .join(" ");
                        return (<g key={series.name}>
                              <path className={`cpue-chart-line ${chartSeriesClass(seriesIndex)}`} d={path}/>
                              {points.map((point, pointIndex) => (<circle key={pointIndex} className={`cpue-chart-point ${chartSeriesClass(seriesIndex)}`} cx={point.x} cy={point.y} r={5}>
                                  <title>
                                    {series.name}:{" "}
                                    {formatNumber(point.value)}
                                  </title>
                                </circle>))}
                            </g>);
                    })
                    : chartModel.categories.flatMap((category, categoryIndex) => {
                        const usableWidth = chartGeometry.categoryStep * 0.78;
                        const barWidth = Math.max(3, usableWidth /
                            Math.max(1, chartModel.series.length));
                        return chartModel.series.map((series, seriesIndex) => {
                            const value = series.values[categoryIndex];
                            if (value == null)
                                return null;
                            const x = chartGeometry.margin.left +
                                chartGeometry.categoryStep *
                                    categoryIndex +
                                chartGeometry.categoryStep *
                                    0.11 +
                                barWidth * seriesIndex;
                            const y = chartGeometry.y(value);
                            const height = chartGeometry.margin.top +
                                chartGeometry.plotHeight -
                                y;
                            return (<rect key={`${category}-${series.name}`} className={`cpue-chart-bar ${chartSeriesClass(seriesIndex)}`} x={x} y={y} width={Math.max(2, barWidth - 2)} height={height} rx={3}>
                                  <title>
                                    {category} — {series.name}:{" "}
                                    {formatNumber(value)}
                                  </title>
                                </rect>);
                        });
                    })}
                </svg>)}
            </div>
          </section>
        </div>)}
    </section>);
}
//# sourceMappingURL=CPUEPage.js.map