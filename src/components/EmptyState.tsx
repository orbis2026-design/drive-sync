"use client";

import Link from "next/link";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <span className="text-6xl mb-4" aria-hidden="true">
        {icon}
      </span>
      <p className="text-2xl font-bold text-white mb-2">{title}</p>
      <p className="text-lg text-gray-400 mb-8 max-w-md">{description}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="px-6 py-3 rounded-2xl bg-brand-400 text-gray-950 font-bold text-sm hover:bg-brand-300 active:scale-95 transition-all"
          >
            {action.label}
          </Link>
        ) : action.onClick ? (
          <button
            type="button"
            onClick={action.onClick}
            className="px-6 py-3 rounded-2xl bg-brand-400 text-gray-950 font-bold text-sm hover:bg-brand-300 active:scale-95 transition-all"
          >
            {action.label}
          </button>
        ) : null
      )}
    </div>
  );
}
