/** A compact GL monogram drawn on a 32 px grid. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    <path d="M15 6H9C4.6 6 2 9.4 2 14v4c0 4.6 2.6 8 7 8h8V14H9v4h4v4H9c-2 0-3-1.6-3-4v-4c0-2.4 1-4 3-4h6V6Z" fill="var(--logo-front)" />
    <path d="M20 6h4v16h7v4H20V6Z" fill="var(--logo-side)" />
  </svg>;
}
