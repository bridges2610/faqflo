import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'dark' | 'light';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTS: Record<Variant, string> = {
  // Solid blue rather than the gradient: white text needs 4.5:1, and the
  // gradient's cyan end is far too light to carry it. The gradient is used for
  // surfaces and decoration instead.
  primary: 'bg-primary text-white shadow-card hover:bg-primary-hover hover:shadow-lift',
  ghost: 'bg-white text-navy border border-line shadow-soft hover:border-primary hover:text-primary',
  dark: 'bg-navy text-white shadow-card hover:bg-navy/90 hover:shadow-lift',
  // For dark or gradient backgrounds. Exists as its own variant because
  // overriding `primary`'s colours through className is a coin-flip — both land
  // at the same specificity and whichever Tailwind emits last wins.
  light: 'bg-white text-navy shadow-lift hover:bg-white/90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[0.9375rem]',
  lg: 'h-13 px-8 text-base',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Trailing arrow that nudges right on hover. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

function Inner({ children, arrow }: { children: ReactNode; arrow?: boolean }) {
  return (
    <>
      {children}
      {arrow && (
        <span
          className="transition-transform duration-200 ease-bounce group-hover:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      )}
    </>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  arrow,
  className = '',
  children,
  ...rest
}: CommonProps & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={`group ${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <Inner arrow={arrow}>{children}</Inner>
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  arrow,
  className = '',
  children,
  ...rest
}: CommonProps & { href: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href'>) {
  return (
    <Link
      href={href}
      className={`group ${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <Inner arrow={arrow}>{children}</Inner>
    </Link>
  );
}
