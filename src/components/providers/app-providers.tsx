"use client";
/**
 * Client-side shell: toasts, the sync engine, the service worker, and the
 * theme. Wrapped once in the root layout so every route gets them.
 */
import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";
import { SyncProvider } from "./sync-provider";
import { ServiceWorkerRegistrar } from "./service-worker";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SyncProvider>
          <ServiceWorkerRegistrar />
          {children}
        </SyncProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
