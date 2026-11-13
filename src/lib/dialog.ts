// In-app dialogs and toasts.
//
// Native window.confirm / window.alert are blocked in many embedded previews
// and iframes (the call silently returns false), which makes every delete
// button look broken. These helpers render real DOM dialogs instead.

let activeDialog: HTMLElement | null = null;

export interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function appConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const {
    title = "Please confirm",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false,
  } = options;

  if (activeDialog) {
    activeDialog.remove();
    activeDialog = null;
  }

  return new Promise<boolean>((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "app-dialog-backdrop";

    const card = document.createElement("div");
    card.className = "app-dialog";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");

    const icon = document.createElement("span");
    icon.className = danger ? "app-dialog-icon danger" : "app-dialog-icon";
    icon.textContent = danger ? "!" : "?";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const body = document.createElement("p");
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "app-dialog-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "app-dialog-btn ghost";
    cancel.textContent = cancelText;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = danger ? "app-dialog-btn danger" : "app-dialog-btn primary";
    confirm.textContent = confirmText;

    actions.append(cancel, confirm);
    card.append(icon, heading, body, actions);
    backdrop.appendChild(card);

    const close = (result: boolean) => {
      document.removeEventListener("keydown", onKey);
      backdrop.classList.remove("open");
      window.setTimeout(() => {
        backdrop.remove();
        if (activeDialog === backdrop) activeDialog = null;
      }, 160);
      resolve(result);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter") close(true);
    };

    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(backdrop);
    activeDialog = backdrop;
    window.requestAnimationFrame(() => backdrop.classList.add("open"));
    window.setTimeout(() => confirm.focus(), 40);
  });
}

export type ToastTone = "success" | "error" | "info";

export function toast(message: string, tone: ToastTone = "info") {
  let host = document.getElementById("app-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "app-toast-host";
    host.className = "app-toast-host";
    document.body.appendChild(host);
  }

  const item = document.createElement("div");
  item.className = `app-toast ${tone}`;
  item.textContent = message;
  host.appendChild(item);

  window.requestAnimationFrame(() => item.classList.add("show"));
  window.setTimeout(() => {
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 280);
  }, 4200);
}
