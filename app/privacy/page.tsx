import { SiteHeader, SiteFooter } from '../header';
import { pageMeta } from '../seo';

export const metadata = pageMeta({ name: 'Privacy Policy', path: '/privacy', description: 'What GameMog stores, what it counts and what it never keeps. No accounts, no ads and no third-party trackers.' });

export default function Privacy() {
  return (
    <>
      <SiteHeader on="" />
      <main className="wrap prose" style={{ paddingTop: 24 }}>
        <h1>Privacy Policy</h1>
        <p className="dim" style={{ marginTop: 6 }}>Last updated 25 September 2026.</p>

        <h2>What we store</h2>
        <p>
          A published world, which holds the title, description and world data generated from what
          you wrote. A leaderboard row, which holds the name you type, your finishing time, place,
          lock count and the tempo you reached. A like or dislike, stored against a random
          identifier your browser generates for itself; it is not linked to you, to your name on a
          leaderboard, or to anything else. When you finish a run, the same identifier is stored
          with the game so a Mog-off can tell who has played both sides.
        </p>
        <p>
          We do not ask for an email address, we do not create accounts, and we do not run
          advertising or third-party tracking scripts on this site.
        </p>

        <h2>What we count</h2>
        <p>
          To learn whether GameMog is working, this site counts its own visits. Each page you open
          and each press of Play is recorded with that same random browser identifier, the page&apos;s
          address, the time, and whether you are on a phone, tablet or computer. On the first page of
          a visit we also note the site that linked you here, such as a search engine, and nothing
          more of that site&apos;s address. We do not record your IP address, we set no cookie for
          this, and the counts never leave our server or go to anyone else.
        </p>

        <h2>Uploaded images</h2>
        <p>
          A character image you upload is sent to the Anthropic API so a model can read its colours
          and proportions, and it is downsampled before it is sent. The resulting description is
          stored with your world. The image itself is not published on the catalogue and is not
          kept after the world is built.
        </p>

        <h2>Your selfie</h2>
        <p>
          If you take a selfie to make your character, it is shrunk in your browser and sent once to
          the Anthropic API, which reports what it can see as a few settings: your skin colour, hair,
          eye colour and build. It is not asked to identify you or to infer anything else about you.
          GameMog never stores the photo: not in our database, not on disk and not in our logs.
          Anthropic&apos;s own privacy policy covers how its API handles what it receives. Your
          character, meaning those settings and the name and number you choose, is kept in your own
          browser. GameMog is for people 13 and over.
        </p>

        <h2>Your browser</h2>
        <p>
          The name you last used on a leaderboard, the worlds you have favorited, and the random
          identifier used for your votes are kept in your own browser storage. Favorites never leave
          your device. The identifier is sent with votes, finished runs and the visit counts above.
          Clearing your site data removes all three, and your existing votes then stay counted but
          can no longer be changed from this browser.
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
