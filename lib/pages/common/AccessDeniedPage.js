"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AccessDeniedPage;
const ui_1 = require("../../components/ui");
function AccessDeniedPage() {
    return (<div className="ui-standard-page">
      <ui_1.PageHeader title="Access Denied" description="Your current VADMA role does not permit access to this module."/>
      <ui_1.EmptyState icon="🔒" title="Permission required" description="Contact a VADMA administrator if you believe your role should include this access."/>
    </div>);
}
//# sourceMappingURL=AccessDeniedPage.js.map