import type { UserProfile } from "../types/user";
import AccessDeniedPage from "../pages/common/AccessDeniedPage";
import {
  canAccessRoute,
  getRoute,
  type AppRouteId,
} from "./routes";

type AppRouteRendererProps = {
  routeId: AppRouteId;
  profile: UserProfile;
};

export default function AppRouteRenderer({
  routeId,
  profile,
}: AppRouteRendererProps) {
  if (!canAccessRoute(profile.role, routeId)) {
    return <AccessDeniedPage />;
  }

  return getRoute(routeId).render(profile);
}
