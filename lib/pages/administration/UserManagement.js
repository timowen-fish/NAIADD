"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = UserManagement;
const react_1 = require("react");
const ui_1 = require("../../components/ui");
const userService_1 = require("../../services/userService");
const user_1 = require("../../types/user");
require("./UserManagement.css");
function getDisplayName(user) {
    const explicitName = user.displayName?.trim();
    if (explicitName) {
        return explicitName;
    }
    const emailName = user.email.split("@")[0] ?? "VADMA User";
    return emailName
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}
function getInitials(user) {
    return getDisplayName(user)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
}
function toDate(value) {
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
    if (typeof value === "object" &&
        value !== null &&
        "toDate" in value &&
        typeof value.toDate === "function") {
        return value.toDate();
    }
    return null;
}
function formatDate(value) {
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
function getTimestamp(value) {
    return toDate(value)?.getTime() ?? 0;
}
function UserManagement({ currentUser, onBack, }) {
    const [users, setUsers] = (0, react_1.useState)([]);
    const [selectedUser, setSelectedUser] = (0, react_1.useState)(null);
    const [creatingUser, setCreatingUser] = (0, react_1.useState)(false);
    const [newFirstName, setNewFirstName] = (0, react_1.useState)("");
    const [newLastName, setNewLastName] = (0, react_1.useState)("");
    const [newEmail, setNewEmail] = (0, react_1.useState)("");
    const [newPassword, setNewPassword] = (0, react_1.useState)("");
    const [newRole, setNewRole] = (0, react_1.useState)("viewer");
    const [newActive, setNewActive] = (0, react_1.useState)(true);
    const [creating, setCreating] = (0, react_1.useState)(false);
    const [createError, setCreateError] = (0, react_1.useState)("");
    const [displayName, setDisplayName] = (0, react_1.useState)("");
    const [role, setRole] = (0, react_1.useState)("viewer");
    const [active, setActive] = (0, react_1.useState)(true);
    const [search, setSearch] = (0, react_1.useState)("");
    const [roleFilter, setRoleFilter] = (0, react_1.useState)("all");
    const [statusFilter, setStatusFilter] = (0, react_1.useState)("all");
    const [sortField, setSortField] = (0, react_1.useState)("name");
    const [sortAscending, setSortAscending] = (0, react_1.useState)(true);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [saving, setSaving] = (0, react_1.useState)(false);
    const [sendingPasswordReset, setSendingPasswordReset] = (0, react_1.useState)(false);
    const [drawerClosing, setDrawerClosing] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)("");
    const [toast, setToast] = (0, react_1.useState)("");
    const drawerRef = (0, react_1.useRef)(null);
    async function loadUsers() {
        setLoading(true);
        setError("");
        try {
            const loadedUsers = await (0, userService_1.listUserProfiles)();
            setUsers(loadedUsers);
        }
        catch {
            setError("Unable to load users. Confirm that Firestore rules allow administrators to read the users collection.");
        }
        finally {
            setLoading(false);
        }
    }
    (0, react_1.useEffect)(() => {
        void loadUsers();
    }, []);
    (0, react_1.useEffect)(() => {
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
    (0, react_1.useEffect)(() => {
        if (!toast) {
            return;
        }
        const timeout = window.setTimeout(() => setToast(""), 3200);
        return () => window.clearTimeout(timeout);
    }, [toast]);
    const filteredUsers = (0, react_1.useMemo)(() => {
        const query = search.trim().toLowerCase();
        return [...users]
            .filter((user) => {
            const matchesSearch = !query ||
                getDisplayName(user).toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query);
            const matchesRole = roleFilter === "all" || user.role === roleFilter;
            const matchesStatus = statusFilter === "all" ||
                (statusFilter === "active" && user.active) ||
                (statusFilter === "inactive" && !user.active);
            return matchesSearch && matchesRole && matchesStatus;
        })
            .sort((left, right) => {
            let result = 0;
            if (sortField === "name") {
                result = getDisplayName(left).localeCompare(getDisplayName(right));
            }
            else if (sortField === "email") {
                result = left.email.localeCompare(right.email);
            }
            else if (sortField === "role") {
                result = user_1.USER_ROLE_LABELS[left.role].localeCompare(user_1.USER_ROLE_LABELS[right.role]);
            }
            else {
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
    const hasChanges = Boolean(selectedUser &&
        (displayName.trim() !== (selectedUser.displayName ?? "").trim() ||
            role !== selectedUser.role ||
            active !== selectedUser.active));
    function openCreateUser() {
        setNewFirstName("");
        setNewLastName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("viewer");
        setNewActive(true);
        setCreateError("");
        setCreatingUser(true);
    }
    async function handleCreateUser() {
        if (creating)
            return;
        const displayName = `${newFirstName.trim()} ${newLastName.trim()}`.trim();
        if (!newFirstName.trim() || !newLastName.trim()) {
            setCreateError("First name and last name are required.");
            return;
        }
        if (!newEmail.trim()) {
            setCreateError("Email is required.");
            return;
        }
        if (newPassword.length < 6) {
            setCreateError("Password must contain at least 6 characters.");
            return;
        }
        setCreating(true);
        setCreateError("");
        try {
            const createdUser = await (0, userService_1.createUserAccount)({
                email: newEmail,
                password: newPassword,
                displayName,
                role: newRole,
                active: newActive,
            });
            setUsers((current) => [...current, createdUser]);
            setCreatingUser(false);
            setToast(`${displayName} was created successfully.`);
        }
        catch (error) {
            const code = error && typeof error === "object" && "code" in error
                ? String(error.code)
                : "";
            if (code.includes("email-already-in-use")) {
                setCreateError("An account already uses this email address.");
            }
            else if (code.includes("invalid-email")) {
                setCreateError("Enter a valid email address.");
            }
            else if (code.includes("weak-password")) {
                setCreateError("The password is too weak.");
            }
            else {
                setCreateError(error instanceof Error
                    ? error.message
                    : "The user could not be created.");
            }
        }
        finally {
            setCreating(false);
        }
    }
    function changeSort(field) {
        if (sortField === field) {
            setSortAscending((current) => !current);
            return;
        }
        setSortField(field);
        setSortAscending(true);
    }
    function openUser(user) {
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
        if (!force &&
            hasChanges &&
            !window.confirm("You have unsaved changes. Discard them and close this panel?")) {
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
            await (0, userService_1.updateUserProfile)(selectedUser.uid, {
                displayName: normalizedName,
                role,
                active,
            });
            const updatedUser = {
                ...selectedUser,
                displayName: normalizedName,
                role,
                active,
            };
            setUsers((currentUsers) => currentUsers.map((user) => user.uid === updatedUser.uid ? updatedUser : user));
            setSelectedUser(updatedUser);
            setToast(`${normalizedName} was updated successfully.`);
        }
        catch (saveError) {
            const code = saveError &&
                typeof saveError === "object" &&
                "code" in saveError
                ? String(saveError.code)
                : "";
            if (code.includes("permission-denied")) {
                setError("Only an active administrator can change account access.");
            }
            else if (code.includes("not-found")) {
                setError("The Firebase Authentication account could not be found.");
            }
            else if (code.includes("failed-precondition")) {
                setError("You cannot deactivate your own account.");
            }
            else {
                setError(saveError instanceof Error
                    ? saveError.message
                    : "The user account could not be updated.");
            }
        }
        finally {
            setSaving(false);
        }
    }
    async function handleSendPasswordReset() {
        if (!selectedUser || sendingPasswordReset) {
            return;
        }
        const confirmed = window.confirm(`Send a password reset email to ${selectedUser.email}?`);
        if (!confirmed) {
            return;
        }
        setSendingPasswordReset(true);
        setError("");
        try {
            await (0, userService_1.sendUserPasswordReset)(selectedUser.email);
            setToast(`Password reset email sent to ${selectedUser.email}.`);
        }
        catch (resetError) {
            const code = resetError &&
                typeof resetError === "object" &&
                "code" in resetError
                ? String(resetError.code)
                : "";
            if (code.includes("invalid-email")) {
                setError("This user does not have a valid email address.");
            }
            else if (code.includes("too-many-requests")) {
                setError("Firebase temporarily blocked additional reset emails. Try again later.");
            }
            else {
                setError(resetError instanceof Error
                    ? resetError.message
                    : "The password reset email could not be sent.");
            }
        }
        finally {
            setSendingPasswordReset(false);
        }
    }
    function handleDrawerKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            requestClose();
            return;
        }
        if (event.key === "Enter" &&
            (event.ctrlKey || event.metaKey) &&
            hasChanges &&
            !saving) {
            event.preventDefault();
            void handleSave();
        }
    }
    return (<div className="user-management">
      <ui_1.PageHeader eyebrow="Administration" title="User Management" description="Manage NAIADD user roles, display names, and account status." actions={<>
            <ui_1.PrimaryButton onClick={openCreateUser}>+ New User</ui_1.PrimaryButton>
            <ui_1.SecondaryButton onClick={onBack}>← Administration</ui_1.SecondaryButton>
          </>}/>

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
            <input type="search" value={search} placeholder="Search by name or email" onChange={(event) => setSearch(event.target.value)}/>
          </div>
        </label>

        <label>
          <span>Role</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All roles</option>
            {user_1.USER_ROLES.map((userRole) => (<option key={userRole} value={userRole}>
                {user_1.USER_ROLE_LABELS[userRole]}
              </option>))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All users</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <ui_1.SecondaryButton className="user-refresh-button" onClick={() => void loadUsers()} disabled={loading}>
          <span className={loading ? "spinning" : ""} aria-hidden="true">↻</span>
          {loading ? "Refreshing…" : "Refresh"}
        </ui_1.SecondaryButton>
      </section>

      {error && !selectedUser && (<div className="user-page-message error">{error}</div>)}

      <section className="user-table-card">
        {loading ? (<div className="user-loading-state">
            <span className="user-loading-spinner" aria-hidden="true"/>
            Loading users…
          </div>) : filteredUsers.length === 0 ? (<div className="user-loading-state">
            No users match the selected filters.
          </div>) : (<div className="user-table-scroll">
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
                    <button type="button" onClick={() => changeSort("lastLogin")}>
                      Last login
                    </button>
                  </th>
                  <th aria-label="Open user"/>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (<tr key={user.uid} tabIndex={0} role="button" aria-label={`Edit ${getDisplayName(user)}`} onClick={() => openUser(user)} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openUser(user);
                    }
                }}>
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
                        {user_1.USER_ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td>
                      <ui_1.StatusBadge tone={user.active ? "success" : "danger"}>
                        {user.active ? "Active" : "Inactive"}
                      </ui_1.StatusBadge>
                    </td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td className="user-row-chevron" aria-hidden="true">›</td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
      </section>

      {selectedUser && (<>
          <button type="button" className={`user-drawer-backdrop ${drawerClosing ? "closing" : ""}`} aria-label="Close edit panel" onClick={() => requestClose()}/>

          <aside ref={drawerRef} className={`user-edit-drawer ${drawerClosing ? "closing" : ""}`} aria-label="Edit user" tabIndex={-1} onKeyDown={handleDrawerKeyDown}>
            <div className="user-drawer-header">
              <div className="user-drawer-identity">
                <span className="user-avatar large">
                  {getInitials(selectedUser)}
                </span>
                <div>
                  <h2>{getDisplayName(selectedUser)}</h2>
                  <span className={`user-role-badge ${selectedUser.role}`}>
                    {user_1.USER_ROLE_LABELS[selectedUser.role]}
                  </span>
                  <p>{selectedUser.email}</p>
                </div>
              </div>

              <button type="button" className="user-close-button" aria-label="Close" onClick={() => requestClose()}>
                ×
              </button>
            </div>

            <div className="user-drawer-form">
              {editingSelf && (<div className="user-self-notice">
                  You are editing your own account. Self-deactivation is
                  disabled.
                </div>)}

              {error && (<div className="user-page-message error">{error}</div>)}

              <label>
                <span>Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus/>
              </label>

              <label>
                <span>Email</span>
                <input value={selectedUser.email} disabled/>
                <small>
                  Email changes require the secure account-management backend.
                </small>
              </label>

              <ui_1.SecondaryButton loading={sendingPasswordReset} disabled={sendingPasswordReset} onClick={() => void handleSendPasswordReset()}>
                Send password reset email
              </ui_1.SecondaryButton>

              <label>
                <span>Role</span>
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  {user_1.USER_ROLES.map((userRole) => (<option key={userRole} value={userRole}>
                      {user_1.USER_ROLE_LABELS[userRole]}
                    </option>))}
                </select>
              </label>

              <label className="user-active-toggle">
                <span>
                  <strong>Active account</strong>
                  <small>
                    Inactive users cannot access the application.
                  </small>
                </span>
                <input type="checkbox" checked={active} disabled={editingSelf} onChange={(event) => setActive(event.target.checked)}/>
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
              <ui_1.SecondaryButton onClick={() => requestClose()}>
                Cancel
              </ui_1.SecondaryButton>
              <ui_1.PrimaryButton loading={saving} disabled={!hasChanges} onClick={() => void handleSave()}>
                Save changes
              </ui_1.PrimaryButton>
            </div>
          </aside>
        </>)}


      {creatingUser && (<>
          <button type="button" className="user-drawer-backdrop" aria-label="Close new user panel" onClick={() => !creating && setCreatingUser(false)}/>

          <aside className="user-edit-drawer" aria-label="Create user" tabIndex={-1}>
            <div className="user-drawer-header">
              <div>
                <h2>New User</h2>
                <p>Create a NAIADD login and user profile.</p>
              </div>

              <button type="button" className="user-close-button" aria-label="Close" disabled={creating} onClick={() => setCreatingUser(false)}>
                ×
              </button>
            </div>

            <div className="user-drawer-form">
              {createError && (<div className="user-page-message error">
                  {createError}
                </div>)}

              <label>
                <span>First name</span>
                <input value={newFirstName} autoFocus disabled={creating} onChange={(event) => setNewFirstName(event.target.value)}/>
              </label>

              <label>
                <span>Last name</span>
                <input value={newLastName} disabled={creating} onChange={(event) => setNewLastName(event.target.value)}/>
              </label>

              <label>
                <span>Email</span>
                <input type="email" value={newEmail} autoComplete="off" disabled={creating} onChange={(event) => setNewEmail(event.target.value)}/>
              </label>

              <label>
                <span>Password</span>
                <input type="password" value={newPassword} autoComplete="new-password" disabled={creating} onChange={(event) => setNewPassword(event.target.value)}/>
                <small>Use at least 6 characters.</small>
              </label>

              <label>
                <span>Role</span>
                <select value={newRole} disabled={creating} onChange={(event) => setNewRole(event.target.value)}>
                  {user_1.USER_ROLES.map((userRole) => (<option key={userRole} value={userRole}>
                      {user_1.USER_ROLE_LABELS[userRole]}
                    </option>))}
                </select>
              </label>

              <label className="user-active-toggle">
                <span>
                  <strong>Active account</strong>
                  <small>Inactive users cannot access the application.</small>
                </span>
                <input type="checkbox" checked={newActive} disabled={creating} onChange={(event) => setNewActive(event.target.checked)}/>
              </label>
            </div>

            <div className="user-drawer-actions">
              <ui_1.SecondaryButton disabled={creating} onClick={() => setCreatingUser(false)}>
                Cancel
              </ui_1.SecondaryButton>
              <ui_1.PrimaryButton loading={creating} onClick={() => void handleCreateUser()}>
                Create User
              </ui_1.PrimaryButton>
            </div>
          </aside>
        </>)}
      {toast && (<div className="user-toast" role="status">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>)}
    </div>);
}
//# sourceMappingURL=UserManagement.js.map