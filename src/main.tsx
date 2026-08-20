import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";

function isHelperHostedApp(): boolean {
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

async function disableLocalhostPwaCache(): Promise<void> {
  if (!isHelperHostedApp()) return;

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.warn("NAIADD could not unregister localhost service workers.", error);
    }
  }

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    } catch (error) {
      console.warn("NAIADD could not clear localhost PWA caches.", error);
    }
  }
}

async function startApplication(): Promise<void> {
  if (isHelperHostedApp()) {
    await disableLocalhostPwaCache();
  } else {
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (registration) console.info("NAIADD service worker registered.");
      },
      onRegisterError(error) {
        console.error("NAIADD service worker registration failed.", error);
      },
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode><App /></StrictMode>,
  );
}

void startApplication();
