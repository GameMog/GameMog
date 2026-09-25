import { SiteHeader, SiteFooter } from '../header';
import { pageMeta } from '../seo';

export const metadata = pageMeta({ name: 'Terms of Service', path: '/terms', description: 'The terms for playing, creating and sharing worlds on GameMog.' });

export default function Terms() {
  return (
    <>
      <SiteHeader on="" />
      <main className="wrap prose" style={{ paddingTop: 24 }}>
        <h1>Terms of Service</h1>
        <p className="dim" style={{ marginTop: 6 }}>Last updated 22 September 2026.</p>

        <h2>What this is</h2>
        <p>
          GameMog is a preview. From text you write and images you upload, GameMog writes
          games as code, which run in a sandbox with no access to this site, your account or the
          network; or it fills in our own racing engine. It is not a finished, operated service: there is no
          account system, no payment, no moderation queue and no uptime commitment. Treat anything
          you publish here as temporary.
        </p>

        <h2>Your content</h2>
        <p>
          You keep ownership of the characters and descriptions you upload. By publishing a world
          you give us permission to store it, show it on the catalogue, and run it for anyone who
          opens its link. You can ask for a world to be removed and we will remove it.
        </p>
        <p>
          Do not upload anything you do not have the right to use, anything depicting a real person
          without their permission, or anything unlawful. Characters from existing franchises are
          reinterpreted rather than copied, but you remain responsible for what you ask for. Games
          are produced by a model, checked automatically and played by a bot before they can be
          published, and are not reviewed by a person.
        </p>

        <h2>Third-party assets</h2>
        <p>
          Games can use characters, motion capture and skies from our <a href="/library">asset
          library</a>. Each one is built from openly licensed sources, listed on that page with its
          author and licence. You may use them in the worlds you make here.
        </p>

        <h2>Published links are public</h2>
        <p>
          Every published world has a URL that anybody holding it can open. There is no private
          mode. Leaderboard entries carry whatever name the player typed, so do not type anything
          you would not put on a public page.
        </p>

        <h2>Scores</h2>
        <p>
          A race result is reported by the game running in your browser. We store it as a claim,
          not as a verified fact, and we may clear the leaderboards at any time.
        </p>

        <h2>No warranty</h2>
        <p>
          The service is provided as is. Worlds may fail to generate, fail to load, or disappear.
          We are not liable for any loss arising from using it.
        </p>

        <h2>Changes</h2>
        <p>
          These terms will change as the product does. The date at the top is the date of the
          version you are reading.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
