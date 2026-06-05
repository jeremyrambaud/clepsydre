import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Card as FumaCard } from 'fumadocs-ui/components/card';
import type { ComponentProps, ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  Download,
  GanttChart,
  Gauge,
  History,
  type LucideIcon,
  Puzzle,
  Rocket,
  Settings,
  Shuffle,
  Timer,
  Trophy,
} from 'lucide-react';
import type { MDXComponents } from 'mdx/types';
import { DownloadInstallTabs } from '@/components/download-install-tabs';

const cardIcons: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  Download,
  GanttChart,
  Gauge,
  History,
  Puzzle,
  Rocket,
  Settings,
  Shuffle,
  Timer,
  Trophy,
};

function Card({ icon, ...props }: ComponentProps<typeof FumaCard>) {
  let resolvedIcon: ReactNode = icon;
  if (typeof icon === 'string') {
    const Icon = cardIcons[icon];
    resolvedIcon = Icon ? <Icon /> : null;
  }
  return <FumaCard icon={resolvedIcon} {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Card,
    DownloadInstallTabs,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
