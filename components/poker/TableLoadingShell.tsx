import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import button from "../Button.module.css";
import header from "./GameHeader.module.css";
import app from "./PokerApp.module.css";
import table from "./PokerTable.module.css";
import styles from "./TableLoadingShell.module.css";

/** Presentation only: shared by the prerendered fallback and initial browser read. */
export function EmptyLoadingTable({ label }: { readonly label: string }) {
  return (
    <div className={app.gameLayout} data-testid="table-loading-shell" aria-busy="true">
      <div className={table.tableShell}>
        <div className={`${table.tableMeta} ${styles.toolbar}`} aria-hidden="true" />
        <div className={`${table.felt} ${styles.emptyFelt}`}>
          <p className={styles.status} role="status" aria-live="polite">{label}</p>
        </div>
        <div className={`${table.actionTray} ${styles.controls}`} aria-hidden="true" />
      </div>
    </div>
  );
}

export function TableLoadingShell({ label, homeHref, controlLabels }: {
  readonly label: string;
  readonly homeHref: string;
  readonly controlLabels: readonly string[];
}) {
  return <>
    <header className={header.gameHeader}>
      <div className={header.gameHeaderInner}>
        <Link href={homeHref} className={header.gameHeaderTitle}>{APP_NAME}</Link>
        <div className={header.controls} aria-hidden="true">
          {controlLabels.map(label => <span key={label} className={`${button.button} ${button.small} ${label === controlLabels[2] ? button.primary : button.ghost} ${styles.headerSpace}`}>{label}</span>)}
        </div>
      </div>
    </header>
    <main className={app.pokerApp}><EmptyLoadingTable label={label} /></main>
  </>;
}
