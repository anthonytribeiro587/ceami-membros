import type { ReactNode } from 'react';

type AdminPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  backAction?: ReactNode;
  actions?: ReactNode;
};

export default function AdminPageHeader({
  eyebrow = 'CEAMI MEMBROS',
  title,
  description,
  backAction,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-heading">
        {backAction && <div className="admin-page-back-slot">{backAction}</div>}
        <div className="admin-page-heading-copy">
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>
  );
}
