import { EmptyState, PageHeader } from "../../components/ui";

export default function AccessDeniedPage() {
  return (
    <div className="ui-standard-page">
      <PageHeader
        title="Access Denied"
        description="Your current VADMA role does not permit access to this module."
      />
      <EmptyState
        icon="🔒"
        title="Permission required"
        description="Contact a VADMA administrator if you believe your role should include this access."
      />
    </div>
  );
}
