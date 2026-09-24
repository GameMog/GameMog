import Link from 'next/link';

/** The logo is the name, set in the display face, linking home. */
export function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="GameMog home"><b>GameMog</b></Link>
  );
}
