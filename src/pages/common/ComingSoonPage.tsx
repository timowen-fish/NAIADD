import { EmptyState, PageHeader } from "../../components/ui";

export default function ComingSoonPage() {
  return (
    <div className="ui-standard-page">
      <PageHeader
        title="Under Construction"
        description="This VADMA module is registered and ready for its feature implementation."
      />
      <EmptyState
        icon="🛠"
        title="Module coming soon"
        description="The route, navigation, and permission checks are already in place."
      />
    </div>
  );
}
