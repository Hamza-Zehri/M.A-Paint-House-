// PDF sharing helpers.
//
// On phones (and browsers that support file sharing) the PDF is handed to the
// native share sheet, where WhatsApp can be selected and the PDF is attached
// automatically. Desktop browsers that cannot share files fall back to
// downloading the PDF and opening the WhatsApp chat with a ready message.

import { downloadBlob } from "./whatsapp";

export function normalizeWhatsAppNumber(input?: string | null): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

export type ShareResult = "shared" | "downloaded";

interface SharePdfOptions {
  blob: Blob;
  filename: string;
  message: string;
  phone?: string | null;
  title?: string;
}

export async function sharePdf({ blob, filename, message, phone, title }: SharePdfOptions): Promise<ShareResult> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: title || filename, text: message });
      return "shared";
    } catch (error: any) {
      // The user cancelled the share sheet — that is not an error.
      if (error?.name === "AbortError") return "shared";
      // Otherwise fall through to download + WhatsApp Web.
    }
  }

  downloadBlob(blob, filename);
  const number = normalizeWhatsAppNumber(phone);
  const hint = `\n\n📎 PDF downloaded: ${filename}\nAttach the downloaded PDF to this chat to send it.`;
  const url = number
    ? `https://wa.me/${number}?text=${encodeURIComponent(message + hint)}`
    : `https://wa.me/?text=${encodeURIComponent(message + hint)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return "downloaded";
}
