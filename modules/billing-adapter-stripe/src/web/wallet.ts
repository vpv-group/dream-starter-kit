"use client";

import { useSyncExternalStore } from "react";

type WalletProvider = "apple" | "google";

const noopSubscribe = () => () => undefined;

/** The device wallet (Apple Pay on Safari/Apple, else Google Pay). */
export function useWalletName(): string {
  const provider = useSyncExternalStore<WalletProvider>(
    noopSubscribe,
    () => ("ApplePaySession" in window ? "apple" : "google"),
    () => "apple",
  );
  return provider === "apple" ? "Apple Pay" : "Google Pay";
}
