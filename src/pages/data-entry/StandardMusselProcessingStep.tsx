import SpecimenStandardStep, {
  type MusselObservationTable,
} from "./SpecimenStandardStep";

type Props = {
  siteID?: string;
  onBack: () => void;
  onContinueToSaveDraft?: (rows: MusselObservationTable[]) => void;
  draftMusselRows?: MusselObservationTable[];
};

export default function StandardMusselProcessingStep(props: Props) {
  return <SpecimenStandardStep {...props} processingType="standard_mussel" />;
}
