'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type AdminPaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
};

function visiblePages(current: number, total: number) {
  const candidates = [1, current - 1, current, current + 1, total]
    .filter((value) => value >= 1 && value <= total);
  return Array.from(new Set(candidates)).sort((a, b) => a - b);
}

export default function AdminPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = 'itens',
}: AdminPaginationProps) {
  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const pages = visiblePages(currentPage, totalPages);

  return (
    <nav className="admin-pagination" aria-label={`Paginação de ${itemLabel}`}>
      <span>
        {start}–{end} de {totalItems} {itemLabel}
      </span>

      {totalPages > 1 && (
        <div className="admin-pagination-controls">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>

          {pages.map((pageNumber, index) => {
            const previous = pages[index - 1];
            return (
              <span key={pageNumber} style={{ display: 'contents' }}>
                {previous && pageNumber - previous > 1 && (
                  <span className="admin-pagination-ellipsis" aria-hidden="true">…</span>
                )}
                <button
                  type="button"
                  className={pageNumber === currentPage ? 'active' : ''}
                  aria-current={pageNumber === currentPage ? 'page' : undefined}
                  aria-label={`Ir para a página ${pageNumber}`}
                  onClick={() => onPageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              </span>
            );
          })}

          <button
            type="button"
            aria-label="Próxima página"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}
