import { notFound } from 'next/navigation';
import { storykitForViewer } from '@/lib/storykit-http';
import { StoryPreview } from './preview';

export const dynamic = 'force-dynamic';

/**
 * The Story Kit build show, stage by stage, for the local dev server only (STORYKIT=on and not production): every
 * browser stage drawn with Night Shift's cast (test-night-shift), its portraits made here by the portrait studio.
 *   /create/story-preview?stage=write|check|cast|voices|drive|art&mode=create|mog
 * A 404 everywhere else.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string; mode?: string }> }) {
  if (process.env.NODE_ENV === 'production' || !(await storykitForViewer())) notFound();
  const q = await searchParams;
  return <StoryPreview stage={q.stage ?? 'cast'} mode={q.mode === 'mog' ? 'mog' : 'create'} />;
}
