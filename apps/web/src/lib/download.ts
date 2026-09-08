/**
 * Saves an already-fetched Blob to disk via a throwaway object URL. Never
 * builds file content itself — callers must fetch the real bytes from the
 * server first (see reportsApi.exportSalesCsv).
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
