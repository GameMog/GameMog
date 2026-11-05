'use client';
import type { StoryWork } from './story-show';

/**
 * The creator's browser's work on a Story Kit world (STORYKIT=on), started when the build's draft arrives with its
 * store draft (done.story: the id and its write token, lib/storykit-build.ts). The work itself is a page of the Story
 * Kit (public/storykit/work.js: forge, portraits, voices, the test drive, key art, then its report to the server); it
 * runs here in a frame this page keeps out of sight, and every step it reports comes back as a StoryWork patch for the
 * build show (app/create/story-show.tsx). The token goes in the frame's fragment, never to a server in an address.
 * The returned function stops it (a new build, or the page leaving).
 */
export type StoryDone = { draft: string; token: string; pack: string; city: string; forge: string[]; voice: number; inherited: number };

export function startStoryWork(story: StoryDone, on: { patch: (p: StoryWork) => void; error: (e: string) => void; done: (r: unknown) => void }): () => void {
  const f = document.createElement('iframe');
  f.title = 'Making your world'; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true');
  f.allow = 'autoplay; gamepad';
  // (rendered, not hidden: the test drive draws the city in it, and its key art is read from that canvas. Inside the
  // window, under the page and fully transparent, never off it: the drive is Mog City on its own origin, and Chrome
  // stops drawing a cross-origin frame that is outside the window, so the drive froze at its first line (WP, 4 Nov))
  Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '1312px', height: '900px', border: '0', pointerEvents: 'none', opacity: '0', zIndex: '-1' });
  f.dataset.storyWork = story.draft;
  function onMessage(e: MessageEvent) {
    if (e.origin !== location.origin || e.source !== f.contentWindow) return;
    const d = e.data as { source?: string; draft?: string; patch?: StoryWork; error?: string };
    if (!d || d.source !== 'storykit-work' || d.draft !== story.draft) return;
    if (d.error) { on.error(d.error); return; }
    if (d.patch) {
      const patch = { ...d.patch } as StoryWork & { stages?: unknown };
      delete patch.stages;
      on.patch(patch);
      if (patch.done) on.done(patch.result);
    }
  }
  addEventListener('message', onMessage);
  f.src = `/storykit/work.html?draft=${encodeURIComponent(story.draft)}&embed=1#t=${encodeURIComponent(story.token)}`;
  document.body.appendChild(f);
  return () => { removeEventListener('message', onMessage); f.remove(); };
}
