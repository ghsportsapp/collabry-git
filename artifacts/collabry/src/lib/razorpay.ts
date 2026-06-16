// Razorpay Standard Web Checkout helper. Loads the hosted checkout script on
// demand and opens the payment modal. The publishable key (`key`) and order id
// come from our backend's create-order response — the secret never touches the
// frontend.

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (resp: any) => void) => void;
    };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

/** Inject checkout.js once; resolves false if it can't load (offline/blocked). */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null; // allow a later retry
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutOptions {
  key: string;
  orderId: string;
  amount: number; // paise
  currency: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (resp: RazorpaySuccess) => void;
  onDismiss?: () => void;
  onFailure?: (message: string) => void;
}

/**
 * Opens the Razorpay modal for a pre-created order. Returns false if the
 * checkout script could not be loaded (caller should surface an error).
 */
export async function openRazorpayCheckout(opts: OpenCheckoutOptions): Promise<boolean> {
  const ok = await loadRazorpayScript();
  if (!ok || !window.Razorpay) return false;

  const rzp = new window.Razorpay({
    key: opts.key,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: opts.currency,
    name: opts.name ?? "Collabry",
    description: opts.description,
    prefill: opts.prefill ?? {},
    theme: { color: "#F0187A" },
    handler: (resp: RazorpaySuccess) => opts.onSuccess(resp),
    modal: { ondismiss: () => opts.onDismiss?.() },
  });
  rzp.on("payment.failed", (resp: any) =>
    opts.onFailure?.(resp?.error?.description ?? "Payment failed"),
  );
  rzp.open();
  return true;
}

export {};
