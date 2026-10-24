import type { ReactNode } from "react";
import { FiRefreshCw } from "react-icons/fi";
import styles from "./page.module.css";

/** The data boundary lives inside this shell; headings never wait for a read. */
export function CollectionShell({ id, title, description, hasAction, children }: {
  id: string; title: string; description?: string; hasAction?: boolean; children: ReactNode;
}) {
  return <section className={styles.section} aria-labelledby={id}>
    <div className={`${styles.collectionHeading} ${hasAction ? styles.withAction : ""}`}>
      <h2 id={id} tabIndex={-1}>{title}</h2>
    </div>
    {description ? <p className={styles.collectionDescription}>{description}</p> : null}
    <div className={styles.listRegion} data-collection-list>{children}</div>
  </section>;
}

export function CollectionRefresh({ label, busy = false, disabled = false, onClick }: {
  label: string; busy?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  return <button className={styles.iconButton} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    <FiRefreshCw aria-hidden="true" className={busy ? styles.spinning : undefined} />
  </button>;
}

export function CollectionSkeleton({ label, refreshLabel }: { label: string; refreshLabel?: string }) {
  return <>
    <span className={styles.srOnly} role="status">{label}</span>
    <div aria-busy="true">
      {refreshLabel ? <CollectionRefresh label={refreshLabel} disabled /> : null}
      <div className={styles.list} aria-hidden="true">{[0, 1, 2].map(row => <div key={row} className={styles.skeletonCard}>
        <span /><span />
      </div>)}</div>
    </div>
  </>;
}
