import SpecimenStandardStep, {
  type FishObservationTable,
} from "./SpecimenStandardStep";

type Props = {
  siteID?: string;
  onBack: () => void;
  onContinueToSaveDraft?: (rows: FishObservationTable[]) => void;
  draftFishRows?: FishObservationTable[];
};

export default function MusselramaStep(props: Props) {
  return <SpecimenStandardStep {...props} processingType="musselrama" />;
}
