import Link from 'next/link';

/**
 * The logo is the name, set in the display face, linking home. icon: the site's icon before it (the owner, 20 Oct:
 * the favicon with the footer's "GameMog").
 */
export function Wordmark({ icon = false }: { icon?: boolean }) {
  return (
    <Link href="/" className="wordmark" aria-label="GameMog home">{icon && <img className="wm-icon" src="/favicon.jpg" width={28} height={28} alt="" />}<b>GameMog</b></Link>
  );
}
