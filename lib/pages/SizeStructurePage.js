"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SizeStructurePage;
const react_1 = require("react");
const queryDataSessionService_1 = require("../services/queryDataSessionService");
const gabelhouseService_1 = require("../services/gabelhouseService");
require("../styles/SizeStructurePage.css");
const DESIGNATIONS = [
    "Substock",
    "Stock",
    "Quality",
    "Preferred",
    "Memorable",
    "Trophy",
];
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
    { value: "psd", label: "PSD" },
    { value: "psdP", label: "PSD-P" },
    { value: "psdM", label: "PSD-M" },
    { value: "psdT", label: "PSD-T" },
    { value: "measuredFish", label: "Measured fish" },
    { value: "stockAndLarger", label: "Stock+" },
    { value: "qualityAndLarger", label: "Quality+" },
    { value: "preferredAndLarger", label: "Preferred+" },
    { value: "memorableAndLarger", label: "Memorable+" },
    { value: "trophyAndLarger", label: "Trophy" },
    { value: "meanLengthMm", label: "Mean length" },
    { value: "largestLengthMm", label: "Largest fish" },
];
function formatNumber(value, maximumFractionDigits = 1) {
    if (value === null ||
        value === undefined ||
        !Number.isFinite(value)) {
        return "—";
    }
    return value.toLocaleString(undefined, {
        maximumFractionDigits,
    });
}
function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Not available"
        : date.toLocaleString();
}
function isAbortError(error) {
    return (error instanceof DOMException &&
        error.name === "AbortError");
}
function groupingLabel(grouping) {
    return (GROUPING_OPTIONS.find((option) => option.value === grouping)?.label ?? grouping);
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
    return `size-structure-chart-series-${index % 8}`;
}
function groupValue(fish, grouping) {
    switch (grouping) {
        case "collection":
            return fish.collectionID || "Unknown Collection";
        case "species":
            return fish.commonName || "Unknown Species";
        case "waterbody":
            return fish.waterbody || "Unknown Waterbody";
        case "surveyor":
            return fish.surveyor || "Unknown Surveyor";
        case "year": {
            const date = new Date(fish.surveyDate);
            return Number.isNaN(date.getTime())
                ? "Unknown Year"
                : String(date.getFullYear());
        }
        case "month": {
            const date = new Date(fish.surveyDate);
            return Number.isNaN(date.getTime())
                ? "Unknown Month"
                : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        }
        default:
            return "Overall";
    }
}
function percentage(numerator, denominator) {
    return denominator > 0
        ? (numerator / denominator) * 100
        : null;
}
function buildGroupedMetrics(fishRows, primaryGrouping, secondaryGrouping) {
    const groups = new Map();
    for (const fish of fishRows) {
        const primaryGroup = groupValue(fish, primaryGrouping);
        const secondaryGroup = secondaryGrouping === "none"
            ? null
            : groupValue(fish, secondaryGrouping);
        const key = `${primaryGroup}\u001f${secondaryGroup ?? ""}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                primaryGroup,
                secondaryGroup,
                collections: new Set(),
                measuredFish: 0,
                substock: 0,
                stockAndLarger: 0,
                qualityAndLarger: 0,
                preferredAndLarger: 0,
                memorableAndLarger: 0,
                trophyAndLarger: 0,
                totalLength: 0,
                largestLengthMm: 0,
            };
            groups.set(key, group);
        }
        const quantity = Math.max(1, fish.quantity);
        group.collections.add(fish.collectionID);
        group.measuredFish += quantity;
        group.totalLength += fish.lengthMm * quantity;
        group.largestLengthMm = Math.max(group.largestLengthMm, fish.lengthMm);
        if (fish.designation === "Substock") {
            group.substock += quantity;
            continue;
        }
        group.stockAndLarger += quantity;
        if (["Quality", "Preferred", "Memorable", "Trophy"].includes(fish.designation)) {
            group.qualityAndLarger += quantity;
        }
        if (["Preferred", "Memorable", "Trophy"].includes(fish.designation)) {
            group.preferredAndLarger += quantity;
        }
        if (["Memorable", "Trophy"].includes(fish.designation)) {
            group.memorableAndLarger += quantity;
        }
        if (fish.designation === "Trophy") {
            group.trophyAndLarger += quantity;
        }
    }
    return [...groups.values()]
        .map((group) => ({
        group: group.secondaryGroup
            ? `${group.primaryGroup} — ${group.secondaryGroup}`
            : group.primaryGroup,
        primaryGroup: group.primaryGroup,
        secondaryGroup: group.secondaryGroup,
        collections: group.collections.size,
        measuredFish: group.measuredFish,
        substock: group.substock,
        stockAndLarger: group.stockAndLarger,
        qualityAndLarger: group.qualityAndLarger,
        preferredAndLarger: group.preferredAndLarger,
        memorableAndLarger: group.memorableAndLarger,
        trophyAndLarger: group.trophyAndLarger,
        psd: percentage(group.qualityAndLarger, group.stockAndLarger),
        psdP: percentage(group.preferredAndLarger, group.stockAndLarger),
        psdM: percentage(group.memorableAndLarger, group.stockAndLarger),
        psdT: percentage(group.trophyAndLarger, group.stockAndLarger),
        meanLengthMm: group.measuredFish > 0
            ? group.totalLength / group.measuredFish
            : null,
        largestLengthMm: group.measuredFish > 0
            ? group.largestLengthMm
            : null,
    }))
        .sort((left, right) => compareGroupValues(left.primaryGroup, right.primaryGroup) ||
        compareGroupValues(left.secondaryGroup ?? "", right.secondaryGroup ?? ""));
}
function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}
function SizeStructurePage() {
    const [appliedQuery, setAppliedQuery] = (0, react_1.useState)(() => (0, queryDataSessionService_1.loadAppliedQueryData)());
    const [result, setResult] = (0, react_1.useState)(null);
    const [selectedSpecies, setSelectedSpecies] = (0, react_1.useState)("");
    const [primaryGrouping, setPrimaryGrouping] = (0, react_1.useState)("year");
    const [secondaryGrouping, setSecondaryGrouping] = (0, react_1.useState)("species");
    const [showVisualization, setShowVisualization] = (0, react_1.useState)(false);
    const [visualMetric, setVisualMetric] = (0, react_1.useState)("psd");
    const [chartType, setChartType] = (0, react_1.useState)("line");
    const [xDimension, setXDimension] = (0, react_1.useState)("primary");
    const [seriesLimit, setSeriesLimit] = (0, react_1.useState)(8);
    const [progress, setProgress] = (0, react_1.useState)(null);
    const [isCalculating, setIsCalculating] = (0, react_1.useState)(false);
    const [errorMessage, setErrorMessage] = (0, react_1.useState)("");
    const abortControllerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const refresh = () => {
            setAppliedQuery((0, queryDataSessionService_1.loadAppliedQueryData)());
            setResult(null);
            setSelectedSpecies("");
            setShowVisualization(false);
        };
        window.addEventListener(queryDataSessionService_1.APPLIED_QUERY_DATA_EVENT, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(queryDataSessionService_1.APPLIED_QUERY_DATA_EVENT, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
    (0, react_1.useEffect)(() => () => abortControllerRef.current?.abort(), []);
    const collectionCount = appliedQuery?.collectionIDs.length ?? 0;
    const hasAppliedQuery = collectionCount > 0;
    const groupedMetrics = (0, react_1.useMemo)(() => result
        ? buildGroupedMetrics(result.fish, primaryGrouping, secondaryGrouping)
        : [], [result, primaryGrouping, secondaryGrouping]);
    const activeSpecies = (0, react_1.useMemo)(() => {
        if (!result?.species.length) {
            return null;
        }
        return (result.species.find((item) => item.species === selectedSpecies) ?? result.species[0]);
    }, [result, selectedSpecies]);
    (0, react_1.useEffect)(() => {
        if (result?.species.length &&
            !result.species.some((item) => item.species === selectedSpecies)) {
            setSelectedSpecies(result.species[0].species);
        }
    }, [result, selectedSpecies]);
    const visibleFish = (0, react_1.useMemo)(() => {
        if (!result || !activeSpecies) {
            return [];
        }
        return result.fish
            .filter((fish) => fish.commonName === activeSpecies.species)
            .slice(0, 500);
    }, [activeSpecies, result]);
    const chartModel = (0, react_1.useMemo)(() => {
        const hasSecondary = groupedMetrics.some((metric) => metric.secondaryGroup != null);
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
            ? VISUAL_METRICS.find((item) => item.value === visualMetric)?.label ?? "Value"
            : otherDimension === "primary"
                ? metric.primaryGroup
                : metric.secondaryGroup ?? "All";
        const categories = [
            ...new Set(groupedMetrics.map(xValue)),
        ].sort(compareGroupValues);
        const totals = new Map();
        groupedMetrics.forEach((metric) => {
            const value = metric[visualMetric];
            if (value == null || !Number.isFinite(value)) {
                return;
            }
            const name = seriesValue(metric);
            totals.set(name, (totals.get(name) ?? 0) + value);
        });
        const seriesNames = [...totals.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, Math.max(1, seriesLimit))
            .map(([name]) => name);
        const lookup = new Map();
        groupedMetrics.forEach((metric) => {
            const value = metric[visualMetric];
            if (value == null || !Number.isFinite(value)) {
                return;
            }
            lookup.set(`${xValue(metric)}\u001f${seriesValue(metric)}`, value);
        });
        const series = seriesNames.map((name) => ({
            name,
            values: categories.map((category) => lookup.get(`${category}\u001f${name}`) ?? null),
        }));
        const maximum = Math.max(1, ...series.flatMap((item) => item.values.filter((value) => value != null)));
        return { categories, series, maximum };
    }, [
        groupedMetrics,
        visualMetric,
        xDimension,
        seriesLimit,
    ]);
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
    const histogramMaximum = activeSpecies
        ? Math.max(1, ...activeSpecies.histogram.map((bin) => bin.count))
        : 1;
    const calculate = async () => {
        if (!appliedQuery ||
            !hasAppliedQuery ||
            isCalculating) {
            return;
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsCalculating(true);
        setErrorMessage("");
        setResult(null);
        setShowVisualization(false);
        setProgress({
            completedCollections: 0,
            totalCollections: collectionCount,
            percentComplete: 0,
            currentCollectionID: "",
        });
        try {
            const nextResult = await (0, gabelhouseService_1.analyzeSizeStructure)({
                collectionIDs: appliedQuery.collectionIDs,
                signal: controller.signal,
                onProgress: setProgress,
            });
            if (!controller.signal.aborted) {
                setResult(nextResult);
            }
        }
        catch (error) {
            if (isAbortError(error)) {
                setErrorMessage("Analysis cancelled.");
            }
            else {
                setErrorMessage(error instanceof Error
                    ? error.message
                    : "Unable to calculate size structure.");
            }
        }
        finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
            setIsCalculating(false);
        }
    };
    const cancel = () => {
        abortControllerRef.current?.abort();
    };
    const exportCsv = () => {
        if (!result || groupedMetrics.length === 0) {
            return;
        }
        const headers = [
            "Primary Group",
            "Secondary Group",
            "Collections",
            "Measured Fish",
            "Substock",
            "Stock+",
            "Quality+",
            "Preferred+",
            "Memorable+",
            "Trophy",
            "PSD",
            "PSD-P",
            "PSD-M",
            "PSD-T",
            "Mean Length mm",
            "Largest Length mm",
        ];
        const rows = groupedMetrics.map((metric) => [
            metric.primaryGroup,
            metric.secondaryGroup ?? "",
            metric.collections,
            metric.measuredFish,
            metric.substock,
            metric.stockAndLarger,
            metric.qualityAndLarger,
            metric.preferredAndLarger,
            metric.memorableAndLarger,
            metric.trophyAndLarger,
            metric.psd ?? "",
            metric.psdP ?? "",
            metric.psdM ?? "",
            metric.psdT ?? "",
            metric.meanLengthMm ?? "",
            metric.largestLengthMm ?? "",
        ]);
        const csv = [headers, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\n");
        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `VADMA_SizeStructure_${primaryGrouping}${secondaryGrouping === "none"
            ? ""
            : `_${secondaryGrouping}`}_${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };
    return (<section className="size-structure-page" aria-labelledby="size-structure-title">
      <header className="size-structure-header">
        <div>
          <span className="size-structure-eyebrow">
            Reports
          </span>
          <h1 id="size-structure-title">
            Size Structure
          </h1>
          <p>
            Classify measured fish using species-specific
            Gabelhouse thresholds and compare PSD metrics
            across one or two grouping dimensions.
          </p>
        </div>
      </header>

      <section className="size-structure-query-card">
        <div className="size-structure-query-heading">
          <div>
            <span>Current Query</span>
            <strong>
              {hasAppliedQuery
            ? `${collectionCount.toLocaleString()} collections ready`
            : "No applied query"}
            </strong>
          </div>

          <span className={hasAppliedQuery
            ? "size-structure-status ready"
            : "size-structure-status"}>
            {hasAppliedQuery
            ? "Ready"
            : "Query required"}
          </span>
        </div>

        <div className="size-structure-grouping-grid">
          <label>
            <span>Primary grouping</span>
            <select value={primaryGrouping} disabled={isCalculating} onChange={(event) => {
            const next = event.target.value;
            setPrimaryGrouping(next);
            if (secondaryGrouping === next) {
                setSecondaryGrouping("none");
            }
        }}>
              {GROUPING_OPTIONS.map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>

          <label>
            <span>Split each group by</span>
            <select value={secondaryGrouping} disabled={isCalculating ||
            primaryGrouping === "overall"} onChange={(event) => setSecondaryGrouping(event.target
            .value)}>
              <option value="none">
                No secondary grouping
              </option>
              {GROUPING_OPTIONS.filter((option) => option.value !== "overall" &&
            option.value !== primaryGrouping).map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>
        </div>

        <p className="size-structure-grouping-note">
          Example: choose Year as the primary grouping and
          Species as the secondary grouping to compare each
          species&apos; PSD trend through time.
        </p>

        {!hasAppliedQuery && (<div className="size-structure-empty">
            Apply a query from the Query Data page before
            running the analysis.
          </div>)}

        <div className="size-structure-actions">
          {result && (<>
              <button type="button" className="size-structure-secondary-button" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="size-structure-secondary-button" onClick={() => setShowVisualization(true)}>
                Visualize
              </button>
            </>)}

          {isCalculating && (<button type="button" className="size-structure-cancel" onClick={cancel}>
              Cancel
            </button>)}

          <button type="button" className="size-structure-calculate" disabled={!hasAppliedQuery || isCalculating} onClick={calculate}>
            {isCalculating
            ? "Calculating…"
            : result
                ? "Recalculate"
                : "Calculate Size Structure"}
          </button>
        </div>

        {progress && (<div className="size-structure-progress">
            <div>
              <strong>
                {progress.percentComplete}% complete
              </strong>
              <span>
                {progress.completedCollections.toLocaleString()}
                {" of "}
                {progress.totalCollections.toLocaleString()}
                {" collections"}
              </span>
            </div>

            <div className="size-structure-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentComplete}>
              <div style={{
                width: `${progress.percentComplete}%`,
            }}/>
            </div>
          </div>)}

        {errorMessage && (<div className="size-structure-error">
            {errorMessage}
          </div>)}
      </section>

      {result && (<>
          <section className="size-structure-summary">
            <article>
              <span>Collections</span>
              <strong>
                {result.collectionCount.toLocaleString()}
              </strong>
            </article>
            <article>
              <span>Measured Fish</span>
              <strong>
                {result.measuredFish.toLocaleString()}
              </strong>
            </article>
            <article>
              <span>Matched Species</span>
              <strong>
                {result.matchedSpeciesCount.toLocaleString()}
              </strong>
            </article>
            <article>
              <span>Result Groups</span>
              <strong>
                {groupedMetrics.length.toLocaleString()}
              </strong>
            </article>
          </section>

          {result.unmatchedSpecies.length > 0 && (<section className="size-structure-unmatched">
              <strong>
                Species without Gabelhouse thresholds
              </strong>
              <span>
                {result.unmatchedSpecies.join(", ")}
              </span>
            </section>)}

          <section className="size-structure-panel">
            <div className="size-structure-panel-heading">
              <div>
                <span>Grouped Results</span>
                <h2>Size Structure Metrics</h2>
              </div>
              <small>
                Generated {formatDate(result.generatedAt)}
              </small>
            </div>

            <div className="size-structure-table-wrap">
              <table className="size-structure-table">
                <thead>
                  <tr>
                    <th>
                      {groupingLabel(primaryGrouping)}
                    </th>
                    {secondaryGrouping !== "none" && (<th>
                        {groupingLabel(secondaryGrouping)}
                      </th>)}
                    <th>Collections</th>
                    <th>N</th>
                    <th>Substock</th>
                    <th>Stock+</th>
                    <th>Quality+</th>
                    <th>Preferred+</th>
                    <th>Memorable+</th>
                    <th>Trophy</th>
                    <th>PSD</th>
                    <th>PSD-P</th>
                    <th>PSD-M</th>
                    <th>PSD-T</th>
                    <th>Mean Length</th>
                    <th>Largest</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedMetrics.map((metric) => (<tr key={`${metric.primaryGroup}-${metric.secondaryGroup ?? ""}`}>
                      <th>{metric.primaryGroup}</th>
                      {secondaryGrouping !== "none" && (<th>
                          {metric.secondaryGroup ?? "—"}
                        </th>)}
                      <td>{metric.collections}</td>
                      <td>{metric.measuredFish}</td>
                      <td>{metric.substock}</td>
                      <td>{metric.stockAndLarger}</td>
                      <td>{metric.qualityAndLarger}</td>
                      <td>
                        {metric.preferredAndLarger}
                      </td>
                      <td>
                        {metric.memorableAndLarger}
                      </td>
                      <td>{metric.trophyAndLarger}</td>
                      <td>{formatNumber(metric.psd)}</td>
                      <td>{formatNumber(metric.psdP)}</td>
                      <td>{formatNumber(metric.psdM)}</td>
                      <td>{formatNumber(metric.psdT)}</td>
                      <td>
                        {formatNumber(metric.meanLengthMm)}{" "}
                        mm
                      </td>
                      <td>
                        {formatNumber(metric.largestLengthMm)}{" "}
                        mm
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>

          {result.species.length > 0 && (<>
              <section className="size-structure-panel">
                <div className="size-structure-panel-heading">
                  <div>
                    <span>Species Detail</span>
                    <h2>Length Distribution</h2>
                  </div>

                  <label>
                    <span>Species</span>
                    <select value={activeSpecies?.species ?? ""} onChange={(event) => setSelectedSpecies(event.target.value)}>
                      {result.species.map((item) => (<option key={item.species} value={item.species}>
                          {item.species}
                        </option>))}
                    </select>
                  </label>
                </div>

                {activeSpecies && (<>
                    <div className="size-structure-species-stats">
                      <div>
                        <span>Measured</span>
                        <strong>
                          {activeSpecies.measuredFish.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <span>PSD</span>
                        <strong>
                          {formatNumber(activeSpecies.psd)}
                        </strong>
                      </div>
                      <div>
                        <span>PSD-P</span>
                        <strong>
                          {formatNumber(activeSpecies.psdP)}
                        </strong>
                      </div>
                      <div>
                        <span>PSD-M</span>
                        <strong>
                          {formatNumber(activeSpecies.psdM)}
                        </strong>
                      </div>
                      <div>
                        <span>PSD-T</span>
                        <strong>
                          {formatNumber(activeSpecies.psdT)}
                        </strong>
                      </div>
                    </div>

                    <div className="size-structure-histogram">
                      {activeSpecies.histogram.map((bin) => (<div className="size-structure-bin" key={bin.minimumMm} title={`${bin.minimumMm}–${bin.maximumMm} mm: ${bin.count} fish`}>
                            <span>
                              {bin.count || ""}
                            </span>
                            <div style={{
                            height: `${Math.max(2, (bin.count /
                                histogramMaximum) *
                                100)}%`,
                        }}/>
                            <small>
                              {bin.minimumMm}
                            </small>
                          </div>))}
                    </div>

                    <div className="size-structure-thresholds">
                      {DESIGNATIONS.slice(1).map((designation) => {
                        const key = `${designation.toLowerCase()}Mm`;
                        return (<div key={designation}>
                              <span>
                                {designation}
                              </span>
                              <strong>
                                {formatNumber(activeSpecies
                                .thresholds[key], 0)}{" "}
                                mm
                              </strong>
                            </div>);
                    })}
                    </div>
                  </>)}
              </section>

              {activeSpecies && (<section className="size-structure-panel">
                  <div className="size-structure-panel-heading">
                    <div>
                      <span>Measured Fish</span>
                      <h2>
                        {activeSpecies.species} Records
                      </h2>
                    </div>
                    <small>
                      Showing up to 500 measured records
                    </small>
                  </div>

                  <div className="size-structure-table-wrap">
                    <table className="size-structure-table">
                      <thead>
                        <tr>
                          <th>Collection</th>
                          <th>Waterbody</th>
                          <th>Site</th>
                          <th>Date</th>
                          <th>Length</th>
                          <th>Quantity</th>
                          <th>Designation</th>
                          <th>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleFish.map((fish, index) => (<tr key={`${fish.collectionID}-${fish.lengthMm}-${index}`}>
                              <td>
                                {fish.collectionID}
                              </td>
                              <td>
                                {fish.waterbody ||
                            "—"}
                              </td>
                              <td>
                                {fish.siteName || "—"}
                              </td>
                              <td>
                                {fish.surveyDate ||
                            "—"}
                              </td>
                              <td>
                                {fish.lengthDisplay}
                              </td>
                              <td>{fish.quantity}</td>
                              <td>
                                <strong>
                                  {fish.designation}
                                </strong>
                              </td>
                              <td>
                                {fish.weight === null
                            ? "—"
                            : `${formatNumber(fish.weight)} ${fish.weightUnit}`}
                              </td>
                            </tr>))}
                      </tbody>
                    </table>
                  </div>
                </section>)}
            </>)}
        </>)}

      {showVisualization && result && (<div className="size-structure-visualization-backdrop" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    setShowVisualization(false);
                }
            }}>
          <section className="size-structure-visualization-modal" role="dialog" aria-modal="true" aria-labelledby="size-structure-visualization-title">
            <div className="size-structure-visualization-header">
              <div>
                <span>Data Visualization</span>
                <h2 id="size-structure-visualization-title">
                  Size Structure Trend Builder
                </h2>
                <p>
                  Choose the metric, chart type,
                  horizontal axis, and number of series
                  shown.
                </p>
              </div>
              <button type="button" className="size-structure-visualization-close" onClick={() => setShowVisualization(false)} aria-label="Close visualization">
                ×
              </button>
            </div>

            <div className="size-structure-visualization-controls">
              <label>
                <span>Metric</span>
                <select value={visualMetric} onChange={(event) => setVisualMetric(event.target
                .value)}>
                  {VISUAL_METRICS.map((option) => (<option key={option.value} value={option.value}>
                      {option.label}
                    </option>))}
                </select>
              </label>

              <label>
                <span>Chart type</span>
                <select value={chartType} onChange={(event) => setChartType(event.target.value)}>
                  <option value="line">
                    Line trend
                  </option>
                  <option value="bar">
                    Grouped bars
                  </option>
                </select>
              </label>

              <label>
                <span>Horizontal axis</span>
                <select value={xDimension} disabled={secondaryGrouping === "none"} onChange={(event) => setXDimension(event.target
                .value)}>
                  <option value="primary">
                    {groupingLabel(primaryGrouping)}
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
                  <option value={50}>
                    All available
                  </option>
                </select>
              </label>
            </div>

            <div className="size-structure-chart-legend">
              {chartModel.series.map((series, index) => (<span key={series.name}>
                    <i className={chartSeriesClass(index)}/>
                    {series.name}
                  </span>))}
            </div>

            <div className="size-structure-chart-shell">
              {chartModel.categories.length === 0 ||
                chartModel.series.length === 0 ? (<div className="size-structure-empty">
                  No values are available for this
                  configuration.
                </div>) : (<svg className="size-structure-chart" viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} role="img" aria-label="Size structure chart">
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const value = chartModel.maximum *
                        (1 - fraction);
                    const y = chartGeometry.margin.top +
                        chartGeometry.plotHeight *
                            fraction;
                    return (<g key={fraction}>
                          <line className="size-structure-chart-grid" x1={chartGeometry.margin
                            .left} x2={chartGeometry.margin
                            .left +
                            chartGeometry.plotWidth} y1={y} y2={y}/>
                          <text className="size-structure-chart-y-label" x={chartGeometry.margin
                            .left - 12} y={y + 4} textAnchor="end">
                            {formatNumber(value)}
                          </text>
                        </g>);
                })}

                  {chartModel.categories.map((category, categoryIndex) => {
                    const x = chartGeometry.margin.left +
                        chartGeometry.categoryStep *
                            (categoryIndex + 0.5);
                    const labelY = chartGeometry.height -
                        chartGeometry.margin.bottom +
                        24;
                    return (<text key={category} className="size-structure-chart-x-label" x={x} y={labelY} textAnchor="end" transform={`rotate(-35 ${x} ${labelY})`}>
                          {category}
                        </text>);
                })}

                  {chartType === "line"
                    ? chartModel.series.map((series, seriesIndex) => {
                        const points = series.values
                            .map((value, categoryIndex) => {
                            if (value == null) {
                                return null;
                            }
                            return {
                                x: chartGeometry
                                    .margin.left +
                                    chartGeometry
                                        .categoryStep *
                                        (categoryIndex +
                                            0.5),
                                y: chartGeometry.y(value),
                                value,
                            };
                        })
                            .filter((point) => point != null);
                        const path = points
                            .map((point, index) => `${index === 0
                            ? "M"
                            : "L"} ${point.x} ${point.y}`)
                            .join(" ");
                        return (<g key={series.name}>
                              <path className={`size-structure-chart-line ${chartSeriesClass(seriesIndex)}`} d={path}/>
                              {points.map((point, pointIndex) => (<circle key={pointIndex} className={`size-structure-chart-point ${chartSeriesClass(seriesIndex)}`} cx={point.x} cy={point.y} r={5}>
                                    <title>
                                      {series.name}:{" "}
                                      {formatNumber(point.value)}
                                    </title>
                                  </circle>))}
                            </g>);
                    })
                    : chartModel.categories.flatMap((category, categoryIndex) => {
                        const usableWidth = chartGeometry.categoryStep *
                            0.78;
                        const barWidth = Math.max(3, usableWidth /
                            Math.max(1, chartModel.series
                                .length));
                        return chartModel.series.map((series, seriesIndex) => {
                            const value = series.values[categoryIndex];
                            if (value == null) {
                                return null;
                            }
                            const x = chartGeometry.margin
                                .left +
                                chartGeometry
                                    .categoryStep *
                                    categoryIndex +
                                chartGeometry
                                    .categoryStep *
                                    0.11 +
                                barWidth *
                                    seriesIndex;
                            const y = chartGeometry.y(value);
                            const height = chartGeometry.margin
                                .top +
                                chartGeometry
                                    .plotHeight -
                                y;
                            return (<rect key={`${category}-${series.name}`} className={`size-structure-chart-bar ${chartSeriesClass(seriesIndex)}`} x={x} y={y} width={Math.max(2, barWidth - 2)} height={height} rx={3}>
                                  <title>
                                    {category} —{" "}
                                    {series.name}:{" "}
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
//# sourceMappingURL=SizeStructurePage.js.map