import SpecimenStandardStep, {
  type MusselObservationTable,
} from "./SpecimenStandardStep";

type Props = {
  siteID?: string;
  onBack: () => void;
  onContinueToSaveDraft?: (rows: MusselObservationTable[]) => void;
  draftMusselRows?: MusselObservationTable[];
};

export default function MusselramaStep(props: Props) {
  return <SpecimenStandardStep {...props} processingType="musselrama" />;
}
