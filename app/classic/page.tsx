import { redirect } from 'next/navigation';

/**
 * The race format from before the GameMog Runtime: three laps run to a beat,
 * no GM, no rival joining each lap. They keep their own rules, so they live
 * here rather than in the homepage's rankings of worlds that play by the
 * platform's.
 */
export default function Classic() {
  redirect('/charts/classic');
}
