import { SiteHeader, SiteFooter } from '../header';

export const metadata = { title: 'Privacy Policy | GameMog' };

export default function Privacy() {
  return (
    <>
      <SiteHeader on="" />
      <main className="wrap prose" style={{ paddingTop: 24 }}>
        <h1>Privacy Policy</h1>
        <p className="dim" style={{ marginTop: 6 }}>Last updated 22 September 2026.</p>

        <h2>What we store</h2>
        <p>
          A published world, which holds the title, description and world data generated from what
          you wrote. A leaderboard row, which holds the name you type, your finishing time, place,
          lock count and the tempo you reached. A like or dislike, stored against a random
          identifier your browser generates for itself; it is not linked to you, to your name on a
          leaderboard, or to anything else. Nothing else is recorded about a play session.
        </p>
        <p>
          We do not ask for an email address, we do not create accounts, and we do not run
          analytics, advertising or third-party tracking scripts on this site.
        </p>

        <h2>Uploaded images</h2>
        <p>
          A character image you upload is sent to the Anthropic API so a model can read its colours
          and proportions, and it is downsampled before it is sent. The resulting description is
          stored with your world. The image itself is not published on the catalogue and is not
          kept after the world is built.
        </p>

        <h2>Your browser</h2>
        <p>
          The name you last used on a leaderboard, the worlds you have favorited, and the random
          identifier used for your votes are kept in your own browser storage. Favorites never leave
          your device. The identifier is sent only with a vote. Clearing your site data removes all
          three, and your existing votes then stay counted but can no longer be changed from this
          browser.
        </p>

        <h2>Games run sandboxed</h2>
        <p>
          Every game runs in a frame with no access to this site, its cookies or its API. A game
          cannot read anything about you. The only thing it can send back is a race result.
        </p>

        <h2>Removal</h2>
        <p>
          Ask and we will delete a world and its leaderboard. Because this is a preview running on
          a single database, deletion is immediate and permanent.
        </p>

        <h2>Changes</h2>
        <p>
          If what we collect changes, this page changes with it, and the date at the top moves.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
