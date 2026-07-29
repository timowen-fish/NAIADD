"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FishEntryGillnetModal;
const react_1 = require("react");
require("../../styles/FishEntryGillnetModal.css");
const FIELD_ORDER_STORAGE_KEY = "vadma_gillnet_fish_entry_field_order_v1";
const DESKTOP_ENTRY_STORAGE_KEY = "vadma_gillnet_fish_entry_not_mobile_v1";
const fixedWildPropagated = ["", "NA", "Wild", "Propagated"];
const fixedDisposition = ["", "NA", "Collected", "Not Collected"];
const fixedMarkRecap = ["", "New Mark", "New Tag", "Recapture"];
const coreFishFieldOrder = [
    "CommonName",
    "Quantity",
    "Length",
    "Weight",
];
const traitFieldOrder = [
    "ForkLength",
    "Sex",
    "Anomaly",
    "Condition",
    "Maturity",
    "WildPropagated",
    "Disposition",
];
const batchFieldOrder = [
    "MinLength",
    "MaxLength",
    "MinWeight",
    "MaxWeight",
    "TotalWeight",
];
const tissueTagFieldOrder = [
    "PrimaryTagType",
    "PrimaryTagNumber",
    "Tag1MarkRecap",
    "SecondaryTagType",
    "SecondaryTagNumber",
    "Tag2MarkRecap",
    "TissueSampleID",
    "TissueResults",
    "OtolithID",
    "OtolithAgeResults",
    "Comments",
];
const defaultFishFieldOrder = [
    ...coreFishFieldOrder,
    ...traitFieldOrder,
    ...batchFieldOrder,
    ...tissueTagFieldOrder,
];
const fieldLabels = {
    CommonName: "Common Name",
    ScientificName: "Scientific Name",
    Quantity: "Qty",
    Length: "Length",
    ForkLength: "Fork Length",
    Weight: "Weight",
    Sex: "Sex",
    Anomaly: "Anomaly",
    Condition: "Condition",
    Maturity: "Maturity",
    WildPropagated: "Wild/Prop.",
    Disposition: "Disposition",
    MinLength: "Min Length",
    MaxLength: "Max Length",
    MinWeight: "Min Weight",
    MaxWeight: "Max Weight",
    TotalWeight: "Total Weight",
    PrimaryTagType: "Primary Tag Type",
    PrimaryTagNumber: "Primary Tag #",
    Tag1MarkRecap: "Tag 1 Recap",
    SecondaryTagType: "Secondary Tag Type",
    SecondaryTagNumber: "Secondary Tag #",
    Tag2MarkRecap: "Tag 2 Recap",
    TissueSampleID: "Tissue ID",
    TissueResults: "Tissue Results",
    OtolithID: "Otolith ID",
    OtolithAgeResults: "Otolith Age",
    Comments: "Comments",
};
function emptyRow() {
    return {
        CommonName: "",
        ScientificName: "",
        Quantity: null,
        Length: null,
        ForkLength: null,
        Weight: null,
    };
}
function uniqueClean(values) {
    return Array.from(new Set((values || []).map((x) => String(x || "").trim()).filter(Boolean))).sort();
}
function valueWasUsed(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
}
function hasAnyField(row, fields) {
    return fields.some((field) => valueWasUsed(row[field]));
}
function hasTagData(row) {
    return hasAnyField(row, tissueTagFieldOrder);
}
function cleanNonNegativeNumber(value, integerOnly = false) {
    if (value === "")
        return null;
    const numericValue = integerOnly ? parseInt(value, 10) : Number(value);
    if (Number.isNaN(numericValue))
        return null;
    if (numericValue < 0)
        return 0;
    return integerOnly ? Math.floor(numericValue) : numericValue;
}
function rowReadyForNextFish(row) {
    return (row.CommonName.trim() !== "" &&
        (row.Quantity !== null ||
            row.Length !== null ||
            row.Weight !== null ||
            hasAnyField(row, traitFieldOrder) ||
            hasAnyField(row, batchFieldOrder) ||
            hasAnyField(row, tissueTagFieldOrder)));
}
function makeNextFishRow(source) {
    if (!source)
        return emptyRow();
    const next = {
        CommonName: source.CommonName || "",
        ScientificName: source.ScientificName || "",
        Quantity: source.CommonName ? 1 : null,
        Length: null,
        ForkLength: null,
        Weight: null,
        Sex: source.Sex || "",
        Anomaly: source.Anomaly || "",
        Condition: source.Condition || "",
        Maturity: source.Maturity || "",
        WildPropagated: source.WildPropagated || "",
        Disposition: source.Disposition || "",
        MinLength: null,
        MaxLength: null,
        MinWeight: null,
        MaxWeight: null,
        TotalWeight: null,
    };
    if (hasTagData(source)) {
        next.PrimaryTagType = source.PrimaryTagType || "";
        next.PrimaryTagNumber = source.PrimaryTagNumber || "";
        next.Tag1MarkRecap = source.Tag1MarkRecap || "";
        next.SecondaryTagType = source.SecondaryTagType || "";
        next.SecondaryTagNumber = source.SecondaryTagNumber || "";
        next.Tag2MarkRecap = source.Tag2MarkRecap || "";
        next.TissueSampleID = source.TissueSampleID || "";
        next.TissueResults = source.TissueResults || "";
        next.OtolithID = source.OtolithID || "";
        next.OtolithAgeResults = source.OtolithAgeResults ?? null;
        next.Comments = source.Comments || "";
    }
    return next;
}
function readSavedFieldOrder() {
    try {
        const raw = localStorage.getItem(FIELD_ORDER_STORAGE_KEY);
        if (!raw)
            return defaultFishFieldOrder;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return defaultFishFieldOrder;
        const saved = parsed.filter((field) => defaultFishFieldOrder.includes(field));
        return [
            ...saved,
            ...defaultFishFieldOrder.filter((field) => !saved.includes(field)),
        ];
    }
    catch {
        return defaultFishFieldOrder;
    }
}
function readSavedDesktopEntryMode() {
    try {
        return localStorage.getItem(DESKTOP_ENTRY_STORAGE_KEY) === "true";
    }
    catch {
        return false;
    }
}
function fieldClassName(field) {
    if (field === "CommonName")
        return "commonNameCol";
    if (field === "Quantity")
        return "quantityCol";
    if (["Length", "ForkLength", "Weight"].includes(field))
        return "measureCol";
    return undefined;
}
function getActiveVadmaThemeName() {
    if (typeof document === "undefined")
        return undefined;
    const themedElements = Array.from(document.querySelectorAll("[data-vadma-theme]"));
    for (let i = themedElements.length - 1; i >= 0; i -= 1) {
        const value = themedElements[i].getAttribute("data-vadma-theme")?.trim();
        if (value)
            return value;
    }
    return undefined;
}
function FishEntryGillnetModal({ activeRun, activePass, rows, onRowsChange, onSave, onClose, }) {
    const [activeVadmaTheme, setActiveVadmaTheme] = (0, react_1.useState)(getActiveVadmaThemeName);
    const [showTraits, setShowTraits] = (0, react_1.useState)(false);
    const [showBatch, setShowBatch] = (0, react_1.useState)(false);
    const [showTissueTags, setShowTissueTags] = (0, react_1.useState)(false);
    const [showReorderFields, setShowReorderFields] = (0, react_1.useState)(false);
    const [desktopEntryMode, setDesktopEntryMode] = (0, react_1.useState)(readSavedDesktopEntryMode);
    const [fishFieldOrder, setFishFieldOrder] = (0, react_1.useState)(readSavedFieldOrder);
    const [species, setSpecies] = (0, react_1.useState)([]);
    const [lists, setLists] = (0, react_1.useState)({});
    const [columnFillState, setColumnFillState] = (0, react_1.useState)(null);
    const [smartTabState, setSmartTabState] = (0, react_1.useState)(null);
    const [pendingFocus, setPendingFocus] = (0, react_1.useState)(null);
    const fieldRefs = (0, react_1.useRef)({});
    const visibleFishFieldSet = (0, react_1.useMemo)(() => new Set([
        ...coreFishFieldOrder,
        ...(showTraits ? traitFieldOrder : []),
        ...(showBatch ? batchFieldOrder : []),
        ...(showTissueTags ? tissueTagFieldOrder : []),
    ]), [showTraits, showBatch, showTissueTags]);
    const visibleFishFields = (0, react_1.useMemo)(() => fishFieldOrder.filter((field) => visibleFishFieldSet.has(field)), [fishFieldOrder, visibleFishFieldSet]);
    (0, react_1.useEffect)(() => {
        function refreshTheme() {
            setActiveVadmaTheme(getActiveVadmaThemeName());
        }
        refreshTheme();
        const observer = new MutationObserver(refreshTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-vadma-theme", "class"],
        });
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["data-vadma-theme", "class"],
            });
        }
        window.addEventListener("storage", refreshTheme);
        window.addEventListener("vadma-theme-change", refreshTheme);
        return () => {
            observer.disconnect();
            window.removeEventListener("storage", refreshTheme);
            window.removeEventListener("vadma-theme-change", refreshTheme);
        };
    }, []);
    (0, react_1.useEffect)(() => {
        try {
            localStorage.setItem(DESKTOP_ENTRY_STORAGE_KEY, String(desktopEntryMode));
        }
        catch {
            // ignore unavailable storage
        }
    }, [desktopEntryMode]);
    (0, react_1.useEffect)(() => {
        try {
            localStorage.setItem(FIELD_ORDER_STORAGE_KEY, JSON.stringify(fishFieldOrder));
        }
        catch {
            // ignore unavailable storage
        }
    }, [fishFieldOrder]);
    function fieldKey(rowIndex, field) {
        return `${rowIndex}:${field}`;
    }
    function setFieldRef(rowIndex, field) {
        return (element) => {
            fieldRefs.current[fieldKey(rowIndex, field)] = element;
        };
    }
    function focusField(rowIndex, field) {
        const element = fieldRefs.current[fieldKey(rowIndex, field)];
        if (!element)
            return;
        const shell = element.closest(".fishTableShell");
        const preservedScrollLeft = shell?.scrollLeft ?? 0;
        element.focus({ preventScroll: true });
        if (!shell)
            return;
        const keepHorizontalPosition = () => {
            shell.scrollLeft = preservedScrollLeft;
            const shellRect = shell.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const verticalPadding = 12;
            if (elementRect.bottom > shellRect.bottom - verticalPadding) {
                shell.scrollTop +=
                    elementRect.bottom - shellRect.bottom + verticalPadding;
            }
            else if (elementRect.top < shellRect.top + verticalPadding) {
                shell.scrollTop -=
                    shellRect.top - elementRect.top + verticalPadding;
            }
            shell.scrollLeft = preservedScrollLeft;
        };
        keepHorizontalPosition();
        window.requestAnimationFrame(() => {
            keepHorizontalPosition();
            window.requestAnimationFrame(() => {
                keepHorizontalPosition();
            });
        });
    }
    function getSmartTabFields(source) {
        if (!source)
            return ["CommonName"];
        const fields = fishFieldOrder.filter((field) => {
            if (field === "CommonName")
                return false;
            if (field === "Quantity") {
                return source.Quantity !== null && source.Quantity !== 1;
            }
            return valueWasUsed(source[field]);
        });
        return fields.length > 0 ? fields : ["CommonName"];
    }
    function moveDesktopFocus(event, rowIndex, field) {
        if (!desktopEntryMode)
            return;
        if (event.key !== "Enter" && event.key !== "Tab")
            return;
        event.preventDefault();
        const currentFieldIndex = visibleFishFields.indexOf(field);
        if (currentFieldIndex === -1)
            return;
        const direction = event.shiftKey && event.key === "Tab" ? -1 : 1;
        let nextRowIndex = rowIndex;
        let nextFieldIndex = currentFieldIndex + direction;
        if (nextFieldIndex >= visibleFishFields.length) {
            nextRowIndex += 1;
            nextFieldIndex = 0;
        }
        if (nextFieldIndex < 0) {
            nextRowIndex -= 1;
            nextFieldIndex = visibleFishFields.length - 1;
        }
        if (nextRowIndex < 0) {
            focusField(rowIndex, field);
            return;
        }
        const nextField = visibleFishFields[nextFieldIndex];
        if (nextRowIndex >= rows.length) {
            setSmartTabState(null);
            setPendingFocus({
                rowIndex: nextRowIndex,
                field: nextField,
            });
            onRowsChange([...rows, emptyRow()]);
            return;
        }
        focusField(nextRowIndex, nextField);
    }
    function handleSmartTab(event, rowIndex, field) {
        if (event.key !== "Tab" || event.shiftKey || !smartTabState)
            return;
        if (smartTabState.rowIndex !== rowIndex)
            return;
        const currentPosition = smartTabState.fields.indexOf(field);
        if (currentPosition === -1)
            return;
        event.preventDefault();
        const nextField = smartTabState.fields[currentPosition + 1];
        if (nextField) {
            focusField(rowIndex, nextField);
            return;
        }
        addNextFish(true);
    }
    function handleFishFieldKeyDown(event, rowIndex, field) {
        if (desktopEntryMode) {
            moveDesktopFocus(event, rowIndex, field);
            return;
        }
        handleSmartTab(event, rowIndex, field);
        if (event.defaultPrevented)
            return;
        if (event.key !== "Enter")
            return;
        const row = rows[rowIndex];
        if (!row || !rowReadyForNextFish(row))
            return;
        event.preventDefault();
        addNextFish(true);
    }
    function moveField(field, direction) {
        setFishFieldOrder((current) => {
            const index = current.indexOf(field);
            if (index === -1)
                return current;
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= current.length)
                return current;
            const next = [...current];
            const [removed] = next.splice(index, 1);
            next.splice(nextIndex, 0, removed);
            return next;
        });
    }
    function resetFieldOrder() {
        setFishFieldOrder(defaultFishFieldOrder);
    }
    (0, react_1.useEffect)(() => {
        if (!pendingFocus)
            return;
        focusField(pendingFocus.rowIndex, pendingFocus.field);
        setPendingFocus(null);
    }, [pendingFocus, rows.length, showTraits, showBatch, showTissueTags, visibleFishFields]);
    (0, react_1.useEffect)(() => {
        function stopFill() {
            setColumnFillState(null);
        }
        window.addEventListener("mouseup", stopFill);
        window.addEventListener("touchend", stopFill);
        return () => {
            window.removeEventListener("mouseup", stopFill);
            window.removeEventListener("touchend", stopFill);
        };
    }, []);
    (0, react_1.useEffect)(() => {
        fetch("/data/fish_species.json")
            .then((r) => r.json())
            .then((data) => {
            setSpecies(data || []);
            localStorage.setItem("vadma_fish_species", JSON.stringify(data || []));
        })
            .catch(() => {
            const cached = localStorage.getItem("vadma_fish_species");
            if (cached)
                setSpecies(JSON.parse(cached));
        });
        fetch("/data/data_entry_lists.json")
            .then((r) => r.json())
            .then((data) => {
            setLists(data || {});
            localStorage.setItem("vadma_data_entry_lists", JSON.stringify(data || {}));
        })
            .catch(() => {
            const cached = localStorage.getItem("vadma_data_entry_lists");
            if (cached)
                setLists(JSON.parse(cached));
        });
    }, []);
    const speciesNames = (0, react_1.useMemo)(() => uniqueClean(species.map((x) => x.CommonName)), [species]);
    const scientificLookup = (0, react_1.useMemo)(() => {
        const out = {};
        species.forEach((sp) => {
            if (sp.CommonName) {
                out[sp.CommonName] = sp.ScientificName || "";
            }
        });
        return out;
    }, [species]);
    function findValidSpecies(value) {
        const cleanValue = value.trim().toLowerCase();
        const exact = speciesNames.find((name) => name.trim().toLowerCase() === cleanValue);
        if (exact)
            return exact;
        const startsWithMatches = speciesNames.filter((name) => name.trim().toLowerCase().startsWith(cleanValue));
        if (startsWithMatches.length === 1)
            return startsWithMatches[0];
        return "";
    }
    function updateRow(index, field, value) {
        onRowsChange(rows.map((row, rowIndex) => {
            if (rowIndex !== index)
                return row;
            const updated = {
                ...row,
                [field]: value,
            };
            if (field === "CommonName" && typeof value === "string") {
                updated.ScientificName = scientificLookup[value] || "";
                if (value.trim() !== "" &&
                    (updated.Quantity === null || updated.Quantity === undefined)) {
                    updated.Quantity = 1;
                }
            }
            return updated;
        }));
    }
    function commitCommonName(index, value) {
        const validSpecies = findValidSpecies(value);
        if (validSpecies) {
            updateRow(index, "CommonName", validSpecies);
        }
        else {
            updateRow(index, "CommonName", value);
        }
    }
    function fillColumnDownTo(targetIndex, field) {
        if (!columnFillState || !columnFillState.active)
            return;
        if (columnFillState.field !== field)
            return;
        if (targetIndex <= columnFillState.startIndex)
            return;
        onRowsChange(rows.map((row, rowIndex) => {
            if (rowIndex <= columnFillState.startIndex ||
                rowIndex > targetIndex) {
                return row;
            }
            const updated = {
                ...row,
                [field]: columnFillState.sourceValue,
            };
            if (field === "CommonName") {
                updated.ScientificName = columnFillState.sourceScientificName || "";
            }
            return updated;
        }));
    }
    function startColumnFill(event, row, rowIndex, field) {
        event.preventDefault();
        setColumnFillState({
            active: true,
            field,
            sourceValue: row[field],
            sourceScientificName: field === "CommonName" ? row.ScientificName || "" : undefined,
            startIndex: rowIndex,
        });
    }
    function addRows(count) {
        setSmartTabState(null);
        onRowsChange([...rows, ...Array(count).fill(null).map(emptyRow)]);
    }
    function addNewFish() {
        setSmartTabState(null);
        onRowsChange([...rows, emptyRow()]);
    }
    function addNextFish(shouldFocusNewRow = false) {
        const lastEntered = [...rows]
            .reverse()
            .find((row) => row.CommonName.trim() !== "");
        const nextRow = makeNextFishRow(lastEntered);
        const nextRowIndex = rows.length;
        const smartFields = getSmartTabFields(lastEntered);
        if (lastEntered) {
            if (hasAnyField(lastEntered, traitFieldOrder))
                setShowTraits(true);
            if (hasAnyField(lastEntered, batchFieldOrder))
                setShowBatch(true);
            if (hasAnyField(lastEntered, tissueTagFieldOrder))
                setShowTissueTags(true);
        }
        setSmartTabState({
            rowIndex: nextRowIndex,
            fields: smartFields,
        });
        if (shouldFocusNewRow) {
            setPendingFocus({
                rowIndex: nextRowIndex,
                field: smartFields[0],
            });
        }
        onRowsChange([...rows, nextRow]);
    }
    function clearTable() {
        const confirmed = window.confirm("Are you sure you want to clear this fish table? This cannot be undone.");
        if (!confirmed)
            return;
        setSmartTabState(null);
        onRowsChange([emptyRow()]);
    }
    function renderFieldCell(row, index, field) {
        if (field === "CommonName") {
            return (<CommonNameCell inputRef={setFieldRef(index, "CommonName")} value={row.CommonName} speciesNames={speciesNames} onKeyDown={(e) => handleFishFieldKeyDown(e, index, "CommonName")} onChange={(value) => updateRow(index, "CommonName", value)} onCommit={(value) => commitCommonName(index, value)}/>);
        }
        if (field === "Quantity") {
            return (<NumberInput inputRef={setFieldRef(index, "Quantity")} value={row.Quantity} integerOnly onKeyDown={(e) => handleFishFieldKeyDown(e, index, "Quantity")} onChange={(v) => updateRow(index, "Quantity", v)}/>);
        }
        if (["Length", "ForkLength", "MinLength", "MaxLength", "OtolithAgeResults"].includes(field)) {
            return (<NumberInput inputRef={setFieldRef(index, field)} value={row[field]} integerOnly onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (["Weight", "MinWeight", "MaxWeight", "TotalWeight"].includes(field)) {
            return (<NumberInput inputRef={setFieldRef(index, field)} value={row[field]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Sex") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.Sex} options={["", ...uniqueClean(lists.Sex)]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Anomaly") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.Anomaly} options={["", ...uniqueClean(lists.Anomaly)]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Condition") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.Condition} options={["", ...uniqueClean(lists.Condition)]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Maturity") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.Maturity} options={["", ...uniqueClean(lists.Maturity)]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "WildPropagated") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.WildPropagated} options={fixedWildPropagated} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Disposition") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row.Disposition} options={fixedDisposition} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "PrimaryTagType" || field === "SecondaryTagType") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row[field]} options={["", ...uniqueClean(lists.TagType)]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        if (field === "Tag1MarkRecap" || field === "Tag2MarkRecap") {
            return (<SelectCell inputRef={setFieldRef(index, field)} value={row[field]} options={fixedMarkRecap} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
        }
        return (<TextInput inputRef={setFieldRef(index, field)} value={row[field]} onKeyDown={(e) => handleFishFieldKeyDown(e, index, field)} onChange={(v) => updateRow(index, field, v)}/>);
    }
    return (<div className="fishModalOverlay" data-vadma-theme={activeVadmaTheme}>
      <section className="fishModal">
        <header className="fishModalHeader">
          <div>
            <p className="fishModalKicker">Biological Observations</p>

            <h2>
              Fish for Net {activeRun + 1} · Panel {activePass + 1}
            </h2>

            <p>
              Enter fish records for this panel. Drag the small square in the
              bottom-right corner of a cell to copy that value downward.
            </p>
          </div>

          <button type="button" className="fishModalClose" onClick={onClose} aria-label="Close fish entry modal">
            ×
          </button>
        </header>

        <div className="fishModalToolbar">
          <label className={showTraits ? "toggleTile active" : "toggleTile"}>
            <input type="checkbox" checked={showTraits} onChange={(e) => setShowTraits(e.target.checked)}/>
            <span className="toggleTileIcon">◇</span>
            <span>
              <strong>Fish Traits</strong>
              <small>Sex, condition, maturity</small>
            </span>
          </label>

          <label className={showBatch ? "toggleTile active" : "toggleTile"}>
            <input type="checkbox" checked={showBatch} onChange={(e) => setShowBatch(e.target.checked)}/>
            <span className="toggleTileIcon">▦</span>
            <span>
              <strong>Batch Processing</strong>
              <small>Ranges and total weights</small>
            </span>
          </label>

          <label className={showTissueTags ? "toggleTile active" : "toggleTile"}>
            <input type="checkbox" checked={showTissueTags} onChange={(e) => setShowTissueTags(e.target.checked)}/>
            <span className="toggleTileIcon">⌁</span>
            <span>
              <strong>Tissue, Otos, Tags</strong>
              <small>Samples, tags, ages</small>
            </span>
          </label>

          <label className={desktopEntryMode ? "toggleTile active" : "toggleTile"}>
            <input type="checkbox" checked={desktopEntryMode} onChange={(e) => setDesktopEntryMode(e.target.checked)}/>
            <span className="toggleTileIcon">↵</span>
            <span>
              <strong>Not Mobile</strong>
              <small>Enter/Tab cycles fields</small>
            </span>
          </label>

          <button type="button" className={showReorderFields ? "toggleTile active" : "toggleTile"} onClick={() => setShowReorderFields((current) => !current)}>
            <span className="toggleTileIcon">↕</span>
            <span>
              <strong>Reorder Fields</strong>
              <small>Saved preference</small>
            </span>
          </button>
        </div>

        {showReorderFields && (<section className="fishReorderPanel">
            <div className="fishReorderHeader">
              <div>
                <strong>Field Order Preference</strong>
                <p>
                  Move fields into the order you want for this survey style.
                  Visible columns and Not Mobile tab order follow this order.
                </p>
              </div>
              <button type="button" className="fishSecondaryButton" onClick={resetFieldOrder}>
                Reset Order
              </button>
            </div>

            <div className="fishReorderList">
              {fishFieldOrder.map((field, index) => (<div key={field} className={visibleFishFieldSet.has(field)
                    ? "fishReorderItem active"
                    : "fishReorderItem"}>
                  <span>{fieldLabels[field]}</span>
                  <small>
                    {visibleFishFieldSet.has(field) ? "Visible" : "Hidden until section is enabled"}
                  </small>
                  <div className="fishReorderButtons">
                    <button type="button" disabled={index === 0} onClick={() => moveField(field, -1)}>
                      ↑
                    </button>
                    <button type="button" disabled={index === fishFieldOrder.length - 1} onClick={() => moveField(field, 1)}>
                      ↓
                    </button>
                  </div>
                </div>))}
            </div>
          </section>)}

        <div className="fishTableShell">
          <table className="fishModalTable">
            <thead>
              <tr>
                <th className="rowNumberCol">#</th>
                {visibleFishFields.map((field) => (<th key={field} className={fieldClassName(field)}>
                    {fieldLabels[field]}
                  </th>))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (<tr key={index}>
                  <td className="rowNumberCol">{index + 1}</td>

                  {visibleFishFields.map((field) => (<td key={field} className={`${fieldClassName(field) || ""} columnFillCell`.trim()} onMouseEnter={() => fillColumnDownTo(index, field)} onTouchMove={() => fillColumnDownTo(index, field)}>
                      {renderFieldCell(row, index, field)}

                      <span className="columnFillHandle" title={`Drag down to copy ${fieldLabels[field]} only`} onMouseDown={(event) => startColumnFill(event, row, index, field)} onTouchStart={(event) => startColumnFill(event, row, index, field)}/>
                    </td>))}
                </tr>))}
            </tbody>
          </table>
        </div>

        <footer className="fishModalActions">
          <div className="fishRowToolsLeft">
            <button type="button" className="fishSecondaryButton" onClick={addNewFish}>
              + New Fish
            </button>

            <button type="button" className="fishSecondaryButton nextFishButton" onClick={() => addNextFish(true)}>
              + Next Fish
            </button>
          </div>

          <div className="fishRowToolsCenter">
            <button type="button" className="fishSecondaryButton" onClick={() => addRows(50)}>
              + Add Rows
            </button>
          </div>

          <div className="fishActionRight">
            <button type="button" className="fishDangerButton" onClick={clearTable}>
              Clear Table
            </button>

            <button type="button" className="fishSaveButton" onClick={onSave}>
              Save
            </button>

            <button type="button" className="fishCloseButton" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </section>
    </div>);
}
function CommonNameCell({ value, speciesNames, onChange, onCommit, onKeyDown, inputRef, }) {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [highlightedIndex, setHighlightedIndex] = (0, react_1.useState)(0);
    const searchText = (value || "").trim().toLowerCase();
    const matches = (0, react_1.useMemo)(() => {
        if (searchText.length < 2)
            return [];
        const startsWith = speciesNames.filter((name) => name.trim().toLowerCase().startsWith(searchText));
        const contains = speciesNames.filter((name) => {
            const cleanName = name.trim().toLowerCase();
            return cleanName.includes(searchText) && !cleanName.startsWith(searchText);
        });
        return [...startsWith, ...contains].slice(0, 12);
    }, [searchText, speciesNames]);
    function selectSpecies(name) {
        onChange(name);
        onCommit(name);
        setIsOpen(false);
        setHighlightedIndex(0);
    }
    return (<div className="fishSpeciesPickListCell">
      <input ref={inputRef} value={value || ""} placeholder="Type species..." autoComplete="off" onFocus={() => setIsOpen(true)} onChange={(e) => {
            setIsOpen(true);
            setHighlightedIndex(0);
            onChange(e.target.value);
        }} onBlur={(e) => {
            window.setTimeout(() => setIsOpen(false), 120);
            onCommit(e.target.value);
        }} onKeyDown={(e) => {
            if (isOpen && matches.length > 0 && e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1));
                return;
            }
            if (isOpen && matches.length > 0 && e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((current) => Math.max(current - 1, 0));
                return;
            }
            if (isOpen && matches.length > 0 && e.key === "Enter") {
                e.preventDefault();
                selectSpecies(matches[highlightedIndex] || matches[0]);
                return;
            }
            if (e.key === "Enter") {
                const cleanValue = e.currentTarget.value.trim().toLowerCase();
                const exact = speciesNames.find((name) => name.trim().toLowerCase() === cleanValue);
                const startsWithMatches = speciesNames.filter((name) => name.trim().toLowerCase().startsWith(cleanValue));
                if (!exact && startsWithMatches.length === 1) {
                    onChange(startsWithMatches[0]);
                    onCommit(startsWithMatches[0]);
                }
            }
            onKeyDown?.(e);
        }}/>

      {isOpen && searchText.length >= 2 && (<div className="fishSpeciesPickListDropdown">
          {matches.length > 0 ? (<>
              <div className="fishSpeciesPickListHeader">
                Matching cached species
              </div>

              {matches.map((name, index) => (<button key={name} type="button" className={index === highlightedIndex
                        ? "fishSpeciesPickListOption active"
                        : "fishSpeciesPickListOption"} onMouseDown={(event) => {
                        event.preventDefault();
                        selectSpecies(name);
                    }}>
                  <span>{name}</span>
                  <small>Select</small>
                </button>))}
            </>) : (<div className="fishSpeciesPickListEmpty">
              No cached species match. Keep typing to enter a custom value.
            </div>)}
        </div>)}
    </div>);
}
function SelectCell({ value, options, onChange, onKeyDown, inputRef, }) {
    return (<select ref={inputRef} value={value || ""} onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => (<option key={option || "blank-option"} value={option}>
          {option}
        </option>))}
    </select>);
}
function TextInput({ value, onChange, onKeyDown, inputRef, }) {
    return (<input ref={inputRef} value={value || ""} onKeyDown={onKeyDown} onChange={(e) => onChange(e.target.value)}/>);
}
function NumberInput({ value, onChange, onKeyDown, inputRef, integerOnly = false, }) {
    return (<input ref={inputRef} type="number" inputMode={integerOnly ? "numeric" : "decimal"} min={0} step={integerOnly ? 1 : "any"} value={value ?? ""} onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e" || e.key === "E") {
                e.preventDefault();
                return;
            }
            if (integerOnly && e.key === ".") {
                e.preventDefault();
                return;
            }
            onKeyDown?.(e);
        }} onChange={(e) => onChange(cleanNonNegativeNumber(e.target.value, integerOnly))}/>);
}
//# sourceMappingURL=FishEntryGillnetModal.js.map