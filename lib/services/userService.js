"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserAuthenticationStatus = setUserAuthenticationStatus;
exports.sendUserPasswordReset = sendUserPasswordReset;
exports.createUserAccount = createUserAccount;
exports.ensureUserProfile = ensureUserProfile;
exports.getUserProfile = getUserProfile;
exports.listUserProfiles = listUserProfiles;
exports.updateUserProfile = updateUserProfile;
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const functions_1 = require("firebase/functions");
const firebase_1 = require("../firebase");
const USERS_COLLECTION = "users";
const FUNCTIONS_REGION = "us-east1";
async function setUserAuthenticationStatus(uid, active) {
    const normalizedUid = uid.trim();
    if (!normalizedUid) {
        throw new Error("User ID is required.");
    }
    const callable = (0, functions_1.httpsCallable)((0, functions_1.getFunctions)(undefined, FUNCTIONS_REGION), "setUserActiveStatus");
    await callable({
        uid: normalizedUid,
        active,
    });
}
async function sendUserPasswordReset(emailAddress) {
    const email = emailAddress.trim().toLowerCase();
    if (!email) {
        throw new Error("Email is required.");
    }
    await (0, auth_1.sendPasswordResetEmail)((0, auth_1.getAuth)(), email);
}
async function createUserAccount(input) {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!email) {
        throw new Error("Email is required.");
    }
    if (!displayName) {
        throw new Error("Display name is required.");
    }
    if (input.password.length < 6) {
        throw new Error("Password must contain at least 6 characters.");
    }
    const primaryApp = (0, app_1.getApp)();
    const secondaryApp = (0, app_1.initializeApp)(primaryApp.options, `naiadd-user-create-${crypto.randomUUID()}`);
    const secondaryAuth = (0, auth_1.getAuth)(secondaryApp);
    try {
        const credential = await (0, auth_1.createUserWithEmailAndPassword)(secondaryAuth, email, input.password);
        try {
            await (0, auth_1.updateProfile)(credential.user, { displayName });
            const userRef = (0, firestore_1.doc)(firebase_1.db, USERS_COLLECTION, credential.user.uid);
            await (0, firestore_1.setDoc)(userRef, {
                uid: credential.user.uid,
                email,
                displayName,
                role: input.role,
                active: input.active,
                createdAt: (0, firestore_1.serverTimestamp)(),
                updatedAt: (0, firestore_1.serverTimestamp)(),
                lastLoginAt: null,
            });
        }
        catch (error) {
            await (0, auth_1.deleteUser)(credential.user).catch(() => undefined);
            throw error;
        }
        return {
            uid: credential.user.uid,
            email,
            displayName,
            role: input.role,
            active: input.active,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastLoginAt: null,
        };
    }
    finally {
        await (0, auth_1.signOut)(secondaryAuth).catch(() => undefined);
        await (0, app_1.deleteApp)(secondaryApp).catch(() => undefined);
    }
}
async function ensureUserProfile(user) {
    const userRef = (0, firestore_1.doc)(firebase_1.db, USERS_COLLECTION, user.uid);
    const snapshot = await (0, firestore_1.getDoc)(userRef);
    if (!snapshot.exists()) {
        const newProfile = {
            uid: user.uid,
            email: user.email ?? "",
            displayName: user.displayName ?? "",
            role: "viewer",
            active: true,
            createdAt: (0, firestore_1.serverTimestamp)(),
            updatedAt: (0, firestore_1.serverTimestamp)(),
            lastLoginAt: (0, firestore_1.serverTimestamp)(),
        };
        await (0, firestore_1.setDoc)(userRef, newProfile);
        return newProfile;
    }
    const existingProfile = snapshot.data();
    await (0, firestore_1.updateDoc)(userRef, {
        email: user.email ?? "",
        displayName: user.displayName ?? existingProfile.displayName ?? "",
        updatedAt: (0, firestore_1.serverTimestamp)(),
        lastLoginAt: (0, firestore_1.serverTimestamp)(),
    });
    return {
        ...existingProfile,
        email: user.email ?? existingProfile.email ?? "",
        displayName: user.displayName ?? existingProfile.displayName ?? "",
    };
}
async function getUserProfile(uid) {
    const userRef = (0, firestore_1.doc)(firebase_1.db, USERS_COLLECTION, uid);
    const snapshot = await (0, firestore_1.getDoc)(userRef);
    if (!snapshot.exists()) {
        return null;
    }
    return {
        uid: snapshot.id,
        ...snapshot.data(),
    };
}
async function listUserProfiles() {
    const snapshot = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, USERS_COLLECTION));
    return snapshot.docs.map((userDocument) => ({
        uid: userDocument.id,
        ...userDocument.data(),
    }));
}
async function updateUserProfile(uid, updates) {
    const userRef = (0, firestore_1.doc)(firebase_1.db, USERS_COLLECTION, uid);
    await setUserAuthenticationStatus(uid, updates.active);
    await (0, firestore_1.updateDoc)(userRef, {
        displayName: updates.displayName.trim(),
        role: updates.role,
        active: updates.active,
        updatedAt: (0, firestore_1.serverTimestamp)(),
    });
}
//# sourceMappingURL=userService.js.map