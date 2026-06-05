import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from './$lang/index';
import { defaultLocale } from '@/lib/i18n';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return <LandingPage locale={defaultLocale} />;
}
