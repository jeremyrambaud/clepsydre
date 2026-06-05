import { cn } from '@/lib/cn';
import Logo from '../../public/images/clepsydre-logo.svg?react';

interface BrandMarkProps {
  className?: string;
  iconClassName?: string;
}

export function BrandMark({ className, iconClassName }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]',
        className,
      )}
      aria-hidden
    >
      <Logo className={cn('h-4.5 w-4.5', iconClassName)} />
    </span>
  );
}
