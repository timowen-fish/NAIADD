import type { SpecimenFormType } from "../../types/surveySession";
import "../../styles/SpecimenTypeSelector.css";

type SpecimenTypeOption = {
  id: SpecimenFormType;
  icon: string;
  title: string;
  subtitle: string;
  details: string[];
};

const specimenTypes: SpecimenTypeOption[] = [
  {
    id: "standard_mussel",
    icon: "◒",
    title: "Standard Mussel Processing",
    subtitle: "Individual mussel measurements and biological observations",
    details: [
      "Species and quantity",
      "Measurements and condition",
      "Tags, tissue, and comments",
    ],
  },
  {
    id: "quads",
    icon: "▦",
    title: "Quads",
    subtitle: "Quadrat-based mussel processing using the standard entry form",
    details: [
      "Quad and replicate groups",
      "Individual or batch records",
      "Ready for a dedicated quad form later",
    ],
  },
  {
    id: "musselrama",
    icon: "◉",
    title: "Musselrama",
    subtitle: "Musselrama observations using the standard entry form",
    details: [
      "Station and pass groups",
      "Individual or batch records",
      "Ready for a dedicated form later",
    ],
  },
];

type Props = {
  selectedType: SpecimenFormType | null;
  onSelect: (type: SpecimenFormType) => void;
  onContinue: () => void;
  onBack: () => void;
};

export default function SpecimenTypeSelector({
  selectedType,
  onSelect,
  onContinue,
  onBack,
}: Props) {
  return (
    <main className="specimen-type-selector">
      <button type="button" className="specimen-type-back" onClick={onBack}>
        ← Back to Survey Information
      </button>

      <section className="specimen-type-hero">
        <div className="specimen-type-hero-icon">◇</div>
        <div>
          <p>Step 3 — Biological Observations</p>
          <h1>Select Specimen Entry Method</h1>
          <span>Choose the mussel-processing workflow used for this survey.</span>
        </div>
      </section>

      <section className="specimen-type-card-shell">
        <div className="specimen-type-grid" role="radiogroup" aria-label="Specimen entry method">
          {specimenTypes.map((option) => {
            const selected = selectedType === option.id;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`specimen-type-card${selected ? " selected" : ""}`}
                onClick={() => onSelect(option.id)}
              >
                <span className="specimen-type-check">{selected ? "✓" : "○"}</span>
                <span className="specimen-type-icon">{option.icon}</span>
                <span className="specimen-type-copy">
                  <strong>{option.title}</strong>
                  <small>{option.subtitle}</small>
                  <span className="specimen-type-detail-list">
                    {option.details.map((detail) => (
                      <span key={detail}>• {detail}</span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="specimen-type-actions">
          <div>
            {selectedType ? (
              <span>A mussel-processing method is selected.</span>
            ) : (
              <span>Select one method to continue.</span>
            )}
          </div>

          <button
            type="button"
            className="specimen-type-continue"
            disabled={!selectedType}
            onClick={onContinue}
          >
            Continue →
          </button>
        </div>
      </section>
    </main>
  );
}
