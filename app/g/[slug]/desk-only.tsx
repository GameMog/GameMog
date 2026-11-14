'use client';
import { useEffect, useState } from 'react';

/**
 * A story world on a phone or tablet (r7, 14 Nov): Create says story worlds are made and played on a desktop or laptop
 * ("Phones come later", app/create/story.tsx), so a story world's page says the same instead of starting Mog City in its
 * frame. The page's art stays in the frame's place, the note under it with the link to take to a computer (Copy link,
 * and Send link where the device has a share sheet). A computer, a narrow window on one included, gets the frame as before;
 * arcade worlds never come here (app/g/[slug]/custom-page.tsx wraps only a story world's frame).
 *
 * A phone here is a touch screen with no hover, the device and not the window's width. Until the browser has said
 * which it is (the server's HTML and the first paint), the frame's place holds the art alone, so a phone never starts
 * loading the city it will not play.
 */
export const DESK_ONLY_NOTE = 'Story worlds play on a desktop or laptop browser. Phones come later.';
export const DESK_ONLY_QUERY = '(hover: none) and (pointer: coarse)';

export function DeskOnly({ title, poster, children }: { title: string; poster: React.ReactNode; children: React.ReactNode }) {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const m = matchMedia(DESK_ONLY_QUERY);
    const f = () => setPhone(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  if (phone === false) return <>{children}</>;
  return (
    <div>
      {/* (data-desk-only: the page's Play brings this into view and asks no full screen, ./play-frame.tsx startPlay) */}
      <div id="play" className="gframe" data-desk-only={phone ? '1' : '0'}>
        <div className="poster" data-hide="0" aria-hidden>{poster}</div>
      </div>
      {phone && <DeskOnlyCard title={title} />}
    </div>
  );
}

function DeskOnlyCard({ title }: { title: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  useEffect(() => { setShare(typeof navigator.share === 'function'); }, []);
  const url = () => location.origin + location.pathname;
  async function copy() {
    setSaid((await copyText(url())) ? 'Link copied' : 'Copy the address above');
  }
  async function send() {
    try { await navigator.share({ title, url: url() }); } catch { /* closed, or refused: nothing to say */ }
  }
  return (
    <div className="panel gdesk" role="note" data-desk-only-note>
      <p className="gdesk-title">Play {title} on a computer</p>
      <p className="gdesk-text">{DESK_ONLY_NOTE} Open this page on a computer to play it.</p>
      <div className="gdesk-row">
        <button type="button" className="btn" onClick={copy} aria-live="polite">{said ?? 'Copy link'}</button>
        {share && <button type="button" className="btn outline" onClick={send}>Send link</button>}
      </div>
    </div>
  );
}

/** The link on the clipboard: the async clipboard where there is one, else the old way (as app/create/generation.tsx). */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* the old way */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.top = '0'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
}
