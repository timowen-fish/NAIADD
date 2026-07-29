"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.auth = void 0;
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const firebaseConfig = {
    apiKey: "AIzaSyDwRKUnfgeNpd-y2gmM0575HGHilLF-Z2g",
    authDomain: "naiadd.firebaseapp.com",
    projectId: "naiadd",
    storageBucket: "naiadd.firebasestorage.app",
    messagingSenderId: "368936200425",
    appId: "1:368936200425:web:0c1e8a3442299071f62878",
};
const app = (0, app_1.initializeApp)(firebaseConfig);
exports.auth = (0, auth_1.getAuth)(app);
exports.db = (0, firestore_1.getFirestore)(app);
exports.default = app;
//# sourceMappingURL=firebase.js.map