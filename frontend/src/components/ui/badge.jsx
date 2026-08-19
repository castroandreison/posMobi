import React from 'react';

const tones = {
  success: 'bg-success/15 text-success border-success/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
  warning: 'bg-warning/15 text-warning border-warning/40',
  primary: 'bg-primary/15 text-primary border-primary/40',
  muted: 'bg-surface-muted text-muted border-border',
};

export const Badge = ({ tone = 'muted', className = '', children }) => (
  <span
    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}
  >
    {children}
  </span>
);