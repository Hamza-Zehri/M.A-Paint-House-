export function shareWhatsApp(phone: string, message: string, fileBlob?: Blob | null) {
  const num = (phone || "").replace(/[^0-9]/g, "");
  const text = encodeURIComponent(message);
  // Download PDF if provided
  if (fileBlob) {
    const url = URL.createObjectURL(fileBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoice.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }
  // Open WhatsApp with prepared message (direct attachment not supported via web)
  const waUrl = num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(waUrl, "_blank");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}