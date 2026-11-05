import { pageMeta } from '../seo';
import { storykitForViewer } from '@/lib/storykit-http';
import { StoryKitFlag } from './story';

export const metadata = pageMeta({
  name: 'Create a world',
  path: '/create',
  description: 'Describe a world in a sentence and GameMog builds a playable 3D game, test-drives it, and gives you a link to share.',
});

// (the Story Kit's switch, STORYKIT=on, handed to the page: off, /create is exactly as it was and stays prerendered;
// STORYKIT=owner reads the owner's session here, so a build made with it renders /create per request: lib/storykit-switch.ts)
export default async function CreateLayout({ children }: { children: React.ReactNode }) {
  return <StoryKitFlag on={await storykitForViewer()}>{children}</StoryKitFlag>;
}
