import type { ReactNode } from 'react';
import CorrectionSelectionGuard from './CorrectionSelectionGuard';

export default function ConsultarLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <><CorrectionSelectionGuard />{children}</>;
}
