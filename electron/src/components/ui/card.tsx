import React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className = '', children }) => (
  <div className={`rounded-xl border border-border bg-surface shadow-sm ${className}`}>
    {children}
  </div>
);

export const CardHeader: React.FC<CardProps> = ({ className = '', children }) => (
  <div className={`flex items-center justify-between gap-2 px-5 py-4 ${className}`}>
    {children}
  </div>
);

export const CardBody: React.FC<CardProps> = ({ className = '', children }) => (
  <div className={`px-5 py-4 ${className}`}>{children}</div>
);
