'use client';

import { useEffect } from 'react';

const CONSULT_QR_PATH = '/brand/qr-consulta.svg?v=20260805';

export default function QrCodeRepair() {
  useEffect(() => {
    function repair() {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
      for (const image of images) {
        if (image.alt === 'QR Code da consulta de cadastro CEAMI' && image.src !== new URL(CONSULT_QR_PATH, window.location.origin).href) {
          image.src = CONSULT_QR_PATH;
          image.style.objectFit = 'contain';
          image.style.imageRendering = 'pixelated';
        }
      }
    }

    repair();
    const observer = new MutationObserver(repair);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
