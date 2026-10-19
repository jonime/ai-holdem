import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import button from "../Button.module.css";
import header from "./GameHeader.module.css";
import app from "./PokerApp.module.css";
import styles from "./TableLoadingShell.module.css";

/** Presentation only: shared by the prerendered fallback and initial browser read. */
export function TableLoadingIndicator({ label, hideLabel = false }: { readonly label: string; readonly hideLabel?: boolean }) {
  return (
    <div className={styles.loader} data-testid="table-loading-shell" aria-busy="true">
      <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
        <span className={styles.spinner} aria-hidden="true" />
        <span className={hideLabel ? styles.srOnly : undefined}>{label}</span>
      </p>
    </div>
  );
}

export function TableLoadingShell({ label, homeHref, controlLabels }: {
  readonly label: string;
  readonly homeHref: string;
  readonly controlLabels: readonly string[];
}) {
  return <div className={styles.loadingPage}>
    <header className={header.gameHeader}>
      <div className={header.gameHeaderInner}>
        <Link href={homeHref} className={header.gameHeaderTitle}>{APP_NAME}</Link>
        <div className={header.controls} aria-hidden="true">
          {controlLabels.map(label => <span key={label} className={`${button.button} ${button.small} ${label === controlLabels[2] ? button.primary : button.ghost} ${styles.headerSpace}`}>{label}</span>)}
        </div>
      </div>
    </header>
    <main className={app.pokerApp}><TableLoadingIndicator label={label} /></main>
  </div>;
}
