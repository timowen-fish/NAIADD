import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import {
  exportDistributionRecords,
  loadDistributionRecords,
  loadDistributionSpecies,
  type DistributionCondition,
  type DistributionRecord,
  type DistributionSpecies,
} from "../services/distributionService";
import "../styles/DistributionsPage.css";

const VIRGINIA_BOUNDS: LatLngBoundsExpression = [
  [36.45, -83.8],
  [39.65, -74.9],
];

const CONDITION_OPTIONS: DistributionCondition[] = [
  "Live",
  "Shell",
  "Historic",
  "Unknown",
];

const DATASET_POINT_COLORS: Record<string, string> = {
  "NAIADD Snapshot": "#d97706",
  "Brian Release Database": "#d80097",
  VAFWIS: "#38a800",
  "Alderman Dataset": "#00a98f",
  "Natural Heritage": "#a900e6",
  "Ortmann Historic Dataset": "#b7791f",
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function earliestInputValue(): string {
  return "1825-01-01";
}

function DistributionMapViewport({
  records,
}: {
  records: DistributionRecord[];
}) {
  const map = useMap();

  useEffect(() => {
    if (records.length === 0) {
      map.fitBounds(VIRGINIA_BOUNDS, {
        padding: [18, 18],
        animate: false,
      });
      return;
    }

    const bounds: LatLngBoundsExpression = records.map((record) => [
      record.latitude,
      record.longitude,
    ]);

    map.fitBounds(bounds, {
      padding: [34, 34],
      maxZoom: 12,
      animate: true,
      duration: 0.45,
    });
  }, [map, records]);

  return null;
}

export default function DistributionsPage() {
  const [records, setRecords] = useState<DistributionRecord[]>([]);
  const [species, setSpecies] = useState<DistributionSpecies[]>([]);
  const [selectedBova, setSelectedBova] = useState("");
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] =
    useState<DistributionCondition[]>(CONDITION_OPTIONS);
  const [startDate, setStartDate] = useState(earliestInputValue());
  const [endDate, setEndDate] = useState(todayInputValue());
  const [pointSize, setPointSize] = useState(4);
  const [showPoints, setShowPoints] = useState(true);
  const [appliedRecords, setAppliedRecords] = useState<DistributionRecord[]>([]);
  const [selectedRecord, setSelectedRecord] =
    useState<DistributionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const loadedRecords = await loadDistributionRecords();
        const loadedSpecies = await loadDistributionSpecies(loadedRecords);

        if (cancelled) return;

        const datasets = [...new Set(loadedRecords.map((row) => row.datasetGroup))]
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));

        setRecords(loadedRecords);
        setSpecies(loadedSpecies);
        setSelectedDatasets(datasets);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load distribution data.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const datasetOptions = useMemo(
    () =>
      [...new Set(records.map((row) => row.datasetGroup))]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [records],
  );

  const visibleSpecies = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();

    if (!query) return species.slice(0, 80);

    return species
      .filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.bova.includes(query),
      )
      .slice(0, 80);
  }, [species, speciesSearch]);

  const filteredRecords = useMemo(() => {
    if (!selectedBova) return [];

    const startTimestamp = startDate
      ? new Date(`${startDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endTimestamp = endDate
      ? new Date(`${endDate}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;

    return records.filter((row) => {
      if (row.bova !== selectedBova) return false;
      if (!selectedDatasets.includes(row.datasetGroup)) return false;
      if (!selectedConditions.includes(row.condition)) return false;

      return (
        row.surveyDateValue === null ||
        (row.surveyDateValue >= startTimestamp &&
          row.surveyDateValue <= endTimestamp)
      );
    });
  }, [
    endDate,
    records,
    selectedBova,
    selectedConditions,
    selectedDatasets,
    startDate,
  ]);

  function toggleDataset(dataset: string) {
    setSelectedDatasets((current) =>
      current.includes(dataset)
        ? current.filter((item) => item !== dataset)
        : [...current, dataset],
    );
  }

  function toggleCondition(condition: DistributionCondition) {
    setSelectedConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition],
    );
  }

  function applyToMap() {
    setApplying(true);
    setSelectedRecord(null);

    window.requestAnimationFrame(() => {
      setAppliedRecords(filteredRecords);
      window.setTimeout(() => setApplying(false), 120);
    });
  }

  const selectedSpecies = species.find((item) => item.bova === selectedBova);

  return (
    <div className="ui-standard-page distributions-page">
      <header className="ui-page-header">
        <div>
          <p className="ui-page-eyebrow">Occurrence Mapping</p>
          <h1>Distributions</h1>
          <p>
            Combine the current NAIADD snapshot with fixed historical datasets
            to map species occurrence records. Filters do not redraw the map
            until Apply to Map is pressed.
          </p>
        </div>
      </header>

      {error && <div className="distribution-error">{error}</div>}

      <div className="distribution-layout">
        <aside className="ui-card distribution-controls">
          <section className="distribution-species-section">
            <div className="distribution-section-heading">
              <div>
                <h2>Species</h2>
                <small>Scientific name or BOVA code</small>
              </div>
              {selectedSpecies && (
                <button
                  type="button"
                  className="distribution-clear-species"
                  onClick={() => {
                    setSelectedBova("");
                    setSpeciesSearch("");
                    setAppliedRecords([]);
                    setSelectedRecord(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <input
              id="distribution-species-search"
              type="search"
              value={speciesSearch}
              placeholder="Search scientific name or BOVA..."
              aria-label="Search scientific name or BOVA"
              onChange={(event) => setSpeciesSearch(event.target.value)}
            />

            <div className="distribution-species-results">
              {loading ? (
                <div className="distribution-species-message">
                  Loading species…
                </div>
              ) : visibleSpecies.length === 0 ? (
                <div className="distribution-species-message">
                  No matching species.
                </div>
              ) : (
                visibleSpecies.map((item) => (
                  <button
                    type="button"
                    key={item.bova}
                    className={
                      selectedBova === item.bova
                        ? "distribution-species-option active"
                        : "distribution-species-option"
                    }
                    onClick={() => {
                      setSelectedBova(item.bova);
                      setSpeciesSearch(item.scientificName);
                    }}
                  >
                    <span>
                      <strong>{item.scientificName || "Scientific name unavailable"}</strong>
                      <small>BOVA {item.bova}</small>
                    </span>
                    {selectedBova === item.bova && <em>Selected</em>}
                  </button>
                ))
              )}
            </div>
          </section>

          <details open>
            <summary>Dataset</summary>
            <div className="distribution-check-list">
              {datasetOptions.map((dataset) => (
                <label key={dataset}>
                  <input
                    type="checkbox"
                    checked={selectedDatasets.includes(dataset)}
                    onChange={() => toggleDataset(dataset)}
                  />
                  <span
                    className="distribution-color-dot"
                    style={{
                      background:
                        DATASET_POINT_COLORS[dataset] ?? "var(--ui-text)",
                    }}
                  />
                  <span>{dataset}</span>
                </label>
              ))}
            </div>
          </details>

          <details open>
            <summary>Condition</summary>
            <div className="distribution-check-list">
              {CONDITION_OPTIONS.map((condition) => (
                <label key={condition}>
                  <input
                    type="checkbox"
                    checked={selectedConditions.includes(condition)}
                    onChange={() => toggleCondition(condition)}
                  />
                  <span>{condition}</span>
                </label>
              ))}
            </div>
          </details>

          <section>
            <h2>Date range</h2>
            <div className="distribution-date-grid">
              <label>
                Start
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
            <small>Records with unknown dates remain included.</small>
          </section>

          <section>
            <h2>Point display</h2>
            <label className="distribution-inline-check">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(event) => setShowPoints(event.target.checked)}
              />
              Show points
            </label>
            <label>
              Point size: {pointSize}
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={pointSize}
                onChange={(event) => setPointSize(Number(event.target.value))}
              />
            </label>
          </section>

          <div className="distribution-action-dock">
            <button
              type="button"
              className="ui-button ui-button-primary distribution-apply"
              disabled={loading || applying || !selectedBova}
              onClick={applyToMap}
            >
              {applying ? "Applying..." : "Apply to Map"}
            </button>

            {selectedBova && filteredRecords.length === 0 && (
              <p className="distribution-no-match">
                No records match the current filters.
              </p>
            )}
          </div>

          <div className="distribution-counts">
            <span>
              <strong>{filteredRecords.length.toLocaleString()}</strong>
              matching
            </span>
            <span>
              <strong>{appliedRecords.length.toLocaleString()}</strong>
              mapped
            </span>
          </div>
        </aside>

        <section className="distribution-map-column">
          <div className="ui-card distribution-map-card">
            <div className="distribution-map-heading">
              <div>
                <h2>{selectedSpecies?.scientificName || "Distribution map"}</h2>
                <p>
                  {selectedSpecies
                    ? `BOVA ${selectedSpecies.bova}`
                    : "Select a species, then apply the filters."}
                </p>
              </div>

              <button
                type="button"
                className="ui-button ui-button-secondary"
                disabled={appliedRecords.length === 0}
                onClick={() =>
                  exportDistributionRecords(
                    appliedRecords,
                    `NAIADD_Distribution_${selectedBova || "Records"}.csv`,
                  )
                }
              >
                Export Records
              </button>
            </div>

            <div className="distribution-map-wrap">
              <MapContainer
                bounds={VIRGINIA_BOUNDS}
                boundsOptions={{ padding: [12, 12] }}
                scrollWheelZoom
              >
                <DistributionMapViewport records={appliedRecords} />

                <LayersControl position="bottomright">
                  <LayersControl.BaseLayer checked name="Light">
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Topographic">
                    <TileLayer
                      attribution="Tiles &copy; Esri"
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                      attribution="Tiles &copy; Esri"
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  </LayersControl.BaseLayer>
                </LayersControl>

                {showPoints &&
                  appliedRecords.map((row) => (
                    <CircleMarker
                      key={row.id}
                      center={[row.latitude, row.longitude]}
                      radius={pointSize}
                      pathOptions={{
                        color: "#111827",
                        weight: 1,
                        fillColor:
                          DATASET_POINT_COLORS[row.datasetGroup] ?? "#111827",
                        fillOpacity: 0.82,
                      }}
                      eventHandlers={{
                        click: () => setSelectedRecord(row),
                      }}
                    >
                      <Popup>
                        <strong>{row.datasetGroup}</strong>
                        <br />
                        Date: {row.surveyDate}
                        <br />
                        Condition: {row.condition}
                        <br />
                        BOVA: {row.bova || "Unknown"}
                      </Popup>
                    </CircleMarker>
                  ))}
              </MapContainer>

              {!loading &&
                selectedBova &&
                appliedRecords.length === 0 && (
                  <div className="distribution-map-empty">
                    <strong>No mapped records yet</strong>
                    <small>
                      Adjust the filters or press Apply to Map to refresh this
                      species.
                    </small>
                  </div>
                )}

              {loading && (
                <div className="distribution-map-loading">
                  <span className="distribution-spinner" />
                  <strong>Loading distribution data</strong>
                  <small>
                    Reading the NAIADD snapshot and historical observations.
                  </small>
                </div>
              )}
            </div>
          </div>

          <div className="ui-card distribution-selected-card">
            <div className="distribution-map-heading">
              <div>
                <h2>Selected Record</h2>
                <p>Click a mapped point to review its standardized values.</p>
              </div>
            </div>

            {selectedRecord ? (
              <div className="distribution-record-grid">
                <span>
                  <small>Dataset</small>
                  <strong>{selectedRecord.datasetGroup}</strong>
                </span>
                <span>
                  <small>Date</small>
                  <strong>{selectedRecord.surveyDate}</strong>
                </span>
                <span>
                  <small>Condition</small>
                  <strong>{selectedRecord.condition}</strong>
                </span>
                <span>
                  <small>Project</small>
                  <strong>{selectedRecord.project}</strong>
                </span>
                <span>
                  <small>Latitude</small>
                  <strong>{selectedRecord.latitude}</strong>
                </span>
                <span>
                  <small>Longitude</small>
                  <strong>{selectedRecord.longitude}</strong>
                </span>
              </div>
            ) : (
              <div className="distribution-record-empty">
                No point is currently selected.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
