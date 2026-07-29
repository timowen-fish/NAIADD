import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../components/ui";
import {
  listUserProfiles,
  updateUserProfile,
} from "../../services/userService";
import {
  USER_ROLE_LABELS,
  USER_ROLES,
  type FirestoreDate,
  type UserProfile,
  type UserRole,
} from "../../types/user";
import "./UserManagement.css";

type RoleFilter = "all" | UserRole;
type StatusFilter = "all" | "active" | "inactive";
type SortField = "name" | "email" | "role" | "lastLogin";

type UserManagementProps = {
  currentUser: UserProfile;
  onBack: () => void;
};

function getDisplayName(user: UserProfile): string {
  const explicitName = user.displayName?.trim();

  if (explicitName) {
    return explicitName;
  }

  const emailName = user.email.split("@")[0] ?? "NAIADD User";

  return emailName
    .split(/[._-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

function getInitials(user: UserProfile): string {
  return getDisplayName(user)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function toDate(value: FirestoreDate): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  return null;
}

function formatDate(value: FirestoreDate): string {
  const date = toDate(value);

  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getTimestamp(value: FirestoreDate): number {
  return toDate(value)?.getTime() ?? 0;
}

export default function UserManagement({
  currentUser,
  onBack,
}: UserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] =
    useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const drawerRef = useRef<HTMLElement | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const loadedUsers = await listUserProfiles();
      setUsers(loadedUsers);
    } catch {
      setError(
        "Unable to load users. Confirm that Firestore rules allow administrators to read the users collection.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    setDisplayName(selectedUser.displayName ?? "");
    setRole(selectedUser.role);
    setActive(selectedUser.active);
    setError("");
    setDrawerClosing(false);

    window.setTimeout(() => {
      drawerRef.current?.focus();
    }, 0);
  }, [selectedUser]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...users]
      .filter((user) => {
        const matchesSearch =
          !query ||
          getDisplayName(user).toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query);

        const matchesRole =
          roleFilter === "all" || user.role === roleFilter;

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && user.active) ||
          (statusFilter === "inactive" && !user.active);

        return matchesSearch && matchesRole && matchesStatus;
      })
      .sort((left, right) => {
        let result = 0;

        if (sortField === "name") {
          result = getDisplayName(left).localeCompare(getDisplayName(right));
        } else if (sortField === "email") {
          result = left.email.localeCompare(right.email);
        } else if (sortField === "role") {
          result = USER_ROLE_LABELS[left.role].localeCompare(
            USER_ROLE_LABELS[right.role],
          );
        } else {
          result =
            getTimestamp(left.lastLoginAt) -
            getTimestamp(right.lastLoginAt);
        }

        return sortAscending ? result : -result;
      });
  }, [
    users,
    search,
    roleFilter,
    statusFilter,
    sortField,
    sortAscending,
  ]);

  const activeCount = users.filter((user) => user.active).length;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const editingSelf = selectedUser?.uid === currentUser.uid;

  const hasChanges = Boolean(
    selectedUser &&
      (displayName.trim() !== (selectedUser.displayName ?? "").trim() ||
        role !== selectedUser.role ||
        active !== selectedUser.active),
  );

  function changeSort(field: SortField) {
    if (sortField === field) {
      setSortAscending((current) => !current);
      return;
    }

    setSortField(field);
    setSortAscending(true);
  }

  function openUser(user: UserProfile) {
    setSelectedUser(user);
  }

  function finishClose() {
    setSelectedUser(null);
    setDrawerClosing(false);
    setError("");
  }

  function requestClose(force = false) {
    if (!selectedUser || drawerClosing) {
      return;
    }

    if (
      !force &&
      hasChanges &&
      !window.confirm(
        "You have unsaved changes. Discard them and close this panel?",
      )
    ) {
      return;
    }

    setDrawerClosing(true);
    window.setTimeout(finishClose, 220);
  }

  async function handleSave() {
    if (!selectedUser || !hasChanges || saving) {
      return;
    }

    const normalizedName = displayName.trim();

    if (!normalizedName) {
      setError("Display name is required.");
      return;
    }

    if (editingSelf && !active) {
      setError("You cannot deactivate your own account.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateUserProfile(selectedUser.uid, {
        displayName: normalizedName,
        role,
        active,
      });

      const updatedUser: UserProfile = {
        ...selectedUser,
        displayName: normalizedName,
        role,
        active,
      };

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.uid === updatedUser.uid ? updatedUser : user,
        ),
      );
      setSelectedUser(updatedUser);
      setToast(`${normalizedName} was updated successfully.`);
    } catch {
      setError(
        "Unable to save changes. Confirm that Firestore rules allow administrators to update user profiles.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }

    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      hasChanges &&
      !saving
    ) {
      event.preventDefault();
      void handleSave();
    }
  }

  return (
    <div className="user-management">
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="Manage NAIADD user roles, display names, and account status."
        actions={
          <SecondaryButton onClick={onBack}>
            ← Administration
          </SecondaryButton>
        }
      />

      <div className="user-summary-grid">
        <section>
          <span className="user-summary-icon" aria-hidden="true">👥</span>
          <div>
            <span>Total users</span>
            <strong>{users.length}</strong>
          </div>
        </section>
        <section>
          <span className="user-summary-icon" aria-hidden="true">✓</span>
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
        </section>
        <section>
          <span className="user-summary-icon" aria-hidden="true">−</span>
          <div>
            <span>Inactive</span>
            <strong>{users.length - activeCount}</strong>
          </div>
        </section>
        <section>
          <span className="user-summary-icon" aria-hidden="true">◆</span>
          <div>
            <span>Administrators</span>
            <strong>{adminCount}</strong>
          </div>
        </section>
      </div>

      <section className="user-toolbar">
        <label className="user-search">
          <span>Search</span>
          <div className="user-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              placeholder="Search by name or email"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </label>

        <label>
          <span>Role</span>
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as RoleFilter)
            }
          >
            <option value="all">All roles</option>
            {USER_ROLES.map((userRole) => (
              <option key={userRole} value={userRole}>
                {USER_ROLE_LABELS[userRole]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="all">All users</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <SecondaryButton
          className="user-refresh-button"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          <span className={loading ? "spinning" : ""} aria-hidden="true">↻</span>
          {loading ? "Refreshing…" : "Refresh"}
        </SecondaryButton>
      </section>

      {error && !selectedUser && (
        <div className="user-page-message error">{error}</div>
      )}

      <section className="user-table-card">
        {loading ? (
          <div className="user-loading-state">
            <span className="user-loading-spinner" aria-hidden="true" />
            Loading users…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="user-loading-state">
            No users match the selected filters.
          </div>
        ) : (
          <div className="user-table-scroll">
            <table className="user-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => changeSort("name")}>
                      User
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => changeSort("role")}>
                      Role
                    </button>
                  </th>
                  <th>Status</th>
                  <th>
                    <button
                      type="button"
                      onClick={() => changeSort("lastLogin")}
                    >
                      Last login
                    </button>
                  </th>
                  <th aria-label="Open user" />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.uid}
                    tabIndex={0}
                    role="button"
                    aria-label={`Edit ${getDisplayName(user)}`}
                    onClick={() => openUser(user)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openUser(user);
                      }
                    }}
                  >
                    <td>
                      <div className="user-identity">
                        <span className="user-avatar">
                          {getInitials(user)}
                        </span>
                        <div>
                          <strong>{getDisplayName(user)}</strong>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`user-role-badge ${user.role}`}>
                        {USER_ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td>
                      <StatusBadge
                        tone={user.active ? "success" : "danger"}
                      >
                        {user.active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td className="user-row-chevron" aria-hidden="true">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedUser && (
        <>
          <button
            type="button"
            className={`user-drawer-backdrop ${
              drawerClosing ? "closing" : ""
            }`}
            aria-label="Close edit panel"
            onClick={() => requestClose()}
          />

          <aside
            ref={drawerRef}
            className={`user-edit-drawer ${
              drawerClosing ? "closing" : ""
            }`}
            aria-label="Edit user"
            tabIndex={-1}
            onKeyDown={handleDrawerKeyDown}
          >
            <div className="user-drawer-header">
              <div className="user-drawer-identity">
                <span className="user-avatar large">
                  {getInitials(selectedUser)}
                </span>
                <div>
                  <h2>{getDisplayName(selectedUser)}</h2>
                  <span className={`user-role-badge ${selectedUser.role}`}>
                    {USER_ROLE_LABELS[selectedUser.role]}
                  </span>
                  <p>{selectedUser.email}</p>
                </div>
              </div>

              <button
                type="button"
                className="user-close-button"
                aria-label="Close"
                onClick={() => requestClose()}
              >
                ×
              </button>
            </div>

            <div className="user-drawer-form">
              {editingSelf && (
                <div className="user-self-notice">
                  You are editing your own account. Self-deactivation is
                  disabled.
                </div>
              )}

              {error && (
                <div className="user-page-message error">{error}</div>
              )}

              <label>
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoFocus
                />
              </label>

              <label>
                <span>Email</span>
                <input value={selectedUser.email} disabled />
                <small>
                  Email changes require the secure account-management backend.
                </small>
              </label>

              <label>
                <span>Role</span>
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as UserRole)
                  }
                >
                  {USER_ROLES.map((userRole) => (
                    <option key={userRole} value={userRole}>
                      {USER_ROLE_LABELS[userRole]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="user-active-toggle">
                <span>
                  <strong>Active account</strong>
                  <small>
                    Inactive users cannot access the application.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={active}
                  disabled={editingSelf}
                  onChange={(event) => setActive(event.target.checked)}
                />
              </label>

              <div className="user-account-metadata">
                <div>
                  <span>Created</span>
                  <strong>{formatDate(selectedUser.createdAt)}</strong>
                </div>
                <div>
                  <span>Last login</span>
                  <strong>{formatDate(selectedUser.lastLoginAt)}</strong>
                </div>
              </div>

              <p className="user-keyboard-hint">
                Press Esc to close. Press Ctrl+Enter to save.
              </p>
            </div>

            <div className="user-drawer-actions">
              <SecondaryButton onClick={() => requestClose()}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                loading={saving}
                disabled={!hasChanges}
                onClick={() => void handleSave()}
              >
                Save changes
              </PrimaryButton>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="user-toast" role="status">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </div>
  );
}
