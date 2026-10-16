import { useI18n } from "./I18nProvider";
import styles from "./Seat.module.css";

/** Shared dealer/blind appearance and precedence for live and historical seats. */
export function SeatRoleBadge({ seat, dealerSeat, smallBlindSeat, bigBlindSeat }: {
  readonly seat: number;
  readonly dealerSeat: number | null;
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number | null;
}) {
  const { dictionary } = useI18n();
  const role = seat === dealerSeat
    ? { label: dictionary.seat.dealerBadge, name: dictionary.seat.dealer, className: styles.dealerBadge }
    : seat === smallBlindSeat
      ? { label: dictionary.seat.smallBlindBadge, name: dictionary.seat.smallBlind, className: styles.smallBlindBadge }
      : seat === bigBlindSeat
        ? { label: dictionary.seat.bigBlindBadge, name: dictionary.seat.bigBlind, className: styles.bigBlindBadge }
        : null;
  return role ? <span className={`${styles.roleBadge} ${role.className}`} title={role.name}>{role.label}</span> : null;
}
