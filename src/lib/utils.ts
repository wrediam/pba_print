import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
	WithElementRef,
	WithoutChild,
	WithoutChildren,
	WithoutChildrenOrChild
} from 'bits-ui';

export type { WithElementRef, WithoutChild, WithoutChildren, WithoutChildrenOrChild };

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Formats cents as a dollar string, e.g. 250 -> "$2.50" */
export function formatCents(cents: number): string {
	return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
