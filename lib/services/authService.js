"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginWithEmailPassword = loginWithEmailPassword;
exports.requestPasswordReset = requestPasswordReset;
exports.logout = logout;
const auth_1 = require("firebase/auth");
const firebase_1 = require("../firebase");
async function loginWithEmailPassword(email, password) {
    await (0, auth_1.signInWithEmailAndPassword)(firebase_1.auth, email, password);
}
async function requestPasswordReset(email) {
    await (0, auth_1.sendPasswordResetEmail)(firebase_1.auth, email);
}
async function logout() {
    await (0, auth_1.signOut)(firebase_1.auth);
}
//# sourceMappingURL=authService.js.map