export type UpgradeIntent = "one_time" | "subscription";

const STORAGE_KEY = "signalyz_upgrade_intent";

export function isUpgradeIntent(value: string | null | undefined): value is UpgradeIntent {
  return value === "one_time" || value === "subscription";
}

export function parseUpgradeIntent(search: string): UpgradeIntent | null {
  const intent = new URLSearchParams(search).get("intent");
  return isUpgradeIntent(intent) ? intent : null;
}

export function rememberUpgradeIntent(intent: UpgradeIntent): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function readStoredUpgradeIntent(): UpgradeIntent | null {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return isUpgradeIntent(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearUpgradeIntent(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function authUrlForUpgradeIntent(intent: UpgradeIntent): string {
  return `/auth?redirect=upgrade&intent=${intent}`;
}

export function postAuthReturnPath(intent: UpgradeIntent | null): string {
  if (intent) return `/?upgrade=open&intent=${intent}`;
  return "/";
}
