const PINK = "#E14F69";
const POPPINS = "'Poppins', sans-serif";

interface Props {
  status: string;
  productRequired: boolean;
  postedBy: string;
  deliveryAddress?: string | null;
  role: "BRAND" | "CREATOR";
}

interface StepDef {
  key: string;
  label: string;
  actor: "Creator" | "Brand" | "";
}

function buildSteps(productRequired: boolean, postedBy: string): StepDef[] {
  const steps: StepDef[] = [
    { key: "started",        label: "Deal Started",      actor: "" },
    { key: "concept",        label: "Submit Concept",    actor: "Creator" },
    { key: "concept_review", label: "Concept Review",    actor: "Brand" },
  ];
  if (productRequired) {
    steps.push({ key: "address",  label: "Delivery\nAddress",   actor: "Creator" });
    steps.push({ key: "ship",     label: "Ship Product",        actor: "Brand" });
    steps.push({ key: "received", label: "Product\nReceived",   actor: "Creator" });
  }
  steps.push({ key: "content",        label: "Upload\nContent",    actor: "Creator" });
  steps.push({ key: "content_review", label: "Content\nReview",    actor: "Brand" });
  steps.push({ key: "complete", label: "Complete", actor: "" });
  return steps;
}

function getActiveIdx(
  status: string,
  productRequired: boolean,
  postedBy: string,
  deliveryAddress: string | null | undefined,
  steps: StepDef[],
): number {
  const idx = (key: string) => steps.findIndex(s => s.key === key);
  switch (status) {
    case "COMPLETED":                return steps.length;
    case "CONTENT_APPROVED":         return steps.length;
    case "DISPUTED":                 return idx("complete");
    case "DISPUTE_WINDOW_OPEN":      return idx("complete");
    case "FINAL_POST_CONFIRMED":     return idx("complete");
    case "URL_FLAGGED":              return idx("complete");
    case "CONTENT_UPLOADED":         return idx("content_review");
    case "POST_LIVE_PENDING":        return idx("complete");
    case "IN_PROGRESS":              return idx("content");
    case "REVISION_REQUESTED":       return idx("content_review");
    case "PRODUCT_RECEIVED":         return idx("content");
    case "PRODUCT_SHIPPED":          return productRequired ? idx("received") : idx("content");
    case "PRODUCT_ISSUE_RAISED":     return productRequired ? idx("received") : idx("content");
    case "AWAITING_CREATOR_ISSUE_DECISION": return productRequired ? idx("received") : idx("content");
    case "CONCEPT_APPROVED":
      if (productRequired) return deliveryAddress ? idx("ship") : idx("address");
      return idx("content");
    case "CONCEPT_SUBMITTED":        return idx("concept_review");
    case "IN_ESCROW":                return idx("concept");
    default:                         return 0;
  }
}

function getNextStepLabel(
  status: string,
  productRequired: boolean,
  postedBy: string,
  deliveryAddress: string | null | undefined,
  isDone: boolean,
  isDisputed: boolean,
): string {
  if (isDone) return "Deal complete";
  if (isDisputed) return "Disputed — Admin review in progress";
  switch (status) {
    case "IN_ESCROW":                       return "Next Step: Creator Action — Submit concept video";
    case "CONCEPT_SUBMITTED":               return "Next Step: Brand Action — Review concept video";
    case "REVISION_REQUESTED":              return "Next Step: Creator Action — Resubmit revised concept";
    case "CONCEPT_APPROVED":
      if (productRequired) {
        if (!deliveryAddress) return "Next Step: Creator Action — Share delivery address";
        return "Next Step: Brand Action — Ship product to creator";
      }
      return "Next Step: Creator Action — Upload final content";
    case "PRODUCT_SHIPPED":                 return "Next Step: Creator Action — Confirm product received";
    case "PRODUCT_RECEIVED":                return "Next Step: Creator Action — Upload final content";
    case "PRODUCT_ISSUE_RAISED":            return "Next Step: Brand Action — Respond to product issue";
    case "AWAITING_CREATOR_ISSUE_DECISION": return "Waiting for creator's decision on the product";
    case "NON_DELIVERY_REPORTED":           return "Admin reviewing non-delivery report";
    case "IN_PROGRESS":                     return "Next Step: Creator Action — Upload final content";
    case "CONTENT_UPLOADED":                return "Next Step: Brand Action — Review final content";
    case "CONTENT_APPROVED":
      return "Deal complete";
    case "POST_LIVE_PENDING":               return "Next Step: Brand Action — Confirm live posts";
    case "URL_FLAGGED":                     return "Next Step: Creator Action — Resubmit flagged post URL";
    case "DISPUTE_WINDOW_OPEN":             return "7-day dispute window open — awaiting completion";
    case "FINAL_POST_CONFIRMED":            return "Photos confirmed — completing deal";
    default:                                return "In progress";
  }
}

export default function DealProgressBar({ status, productRequired, postedBy, deliveryAddress, role }: Props) {
  const steps = buildSteps(productRequired, postedBy ?? "CREATOR");
  const activeIdx = getActiveIdx(status, productRequired, postedBy ?? "CREATOR", deliveryAddress, steps);
  const isDone = activeIdx >= steps.length;
  const isDisputed = status === "DISPUTED";

  const nextLabel = getNextStepLabel(status, productRequired, postedBy ?? "CREATOR", deliveryAddress, isDone, isDisputed);

  return (
    <div style={{ fontFamily: POPPINS, marginBottom: 12 }}>
      <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: "max-content", gap: 0 }}>
          {steps.map((step, i) => {
            const isCompleted = i < activeIdx;
            const isActive = i === activeIdx;
            const lineCompleted = i > 0 && i <= activeIdx;
            const isMyAction =
              (role === "BRAND" && step.actor === "Brand") ||
              (role === "CREATOR" && step.actor === "Creator");

            return (
              <div key={step.key} style={{ display: "flex", alignItems: "flex-start" }}>
                {i > 0 && (
                  <div style={{
                    width: 20, height: 2, marginTop: 11, flexShrink: 0,
                    background: lineCompleted ? PINK : "rgba(255,255,255,0.10)",
                    transition: "background 0.3s",
                  }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 52 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    background: isCompleted ? PINK : isActive ? "rgba(240,24,122,0.15)" : "rgba(255,255,255,0.06)",
                    border: isActive ? `2px solid ${PINK}` : isCompleted ? "none" : "1px solid rgba(255,255,255,0.12)",
                    transition: "all 0.3s",
                  }}>
                    {isCompleted && (
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {isActive && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: PINK }} />
                    )}
                  </div>
                  <p style={{
                    fontSize: 8.5, fontFamily: POPPINS, whiteSpace: "pre-line", textAlign: "center",
                    marginTop: 3, lineHeight: 1.25, maxWidth: 52,
                    color: isCompleted ? "rgba(255,255,255,0.75)" : isActive ? "white" : "rgba(255,255,255,0.70)",
                    fontWeight: isActive ? 700 : 400,
                  }}>
                    {step.label}
                  </p>
                  {step.actor && (
                    <p style={{
                      fontSize: 8, fontFamily: POPPINS, textAlign: "center", marginTop: 1,
                      color: isActive && isMyAction ? PINK : "rgba(255,255,255,0.70)",
                      fontWeight: isActive && isMyAction ? 700 : 400,
                    }}>
                      {step.actor}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{
        marginTop: 6, padding: "5px 10px", borderRadius: 8,
        background: isDone
          ? "rgba(34,197,94,0.08)"
          : isDisputed
          ? "rgba(239,68,68,0.12)"
          : "rgba(240,24,122,0.07)",
        border: `1px solid ${isDone ? "rgba(34,197,94,0.20)" : isDisputed ? "rgba(239,68,68,0.35)" : "rgba(240,24,122,0.18)"}`,
        display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: isDone ? "#22c55e" : isDisputed ? "#ef4444" : PINK, flexShrink: 0 }} />
        <p style={{ fontSize: 10, fontFamily: POPPINS, color: isDone ? "#22c55e" : isDisputed ? "#f87171" : "rgba(255,255,255,0.90)", fontWeight: 600, margin: 0 }}>
          {nextLabel}
        </p>
      </div>
    </div>
  );
}
