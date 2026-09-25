import { pageMeta } from '../seo';

export const metadata = pageMeta({
  name: 'Create a world',
  path: '/create',
  description: 'Describe a world in a sentence and GameMog builds a playable 3D game, test-drives it, and gives you a link to share.',
});

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
