import { useLocation } from "wouter";

const POPPINS = "'Poppins', sans-serif";
const PINK = "#F0187A";

/**
 * Posting-credit notice for the campaign/barter slot step (and review). Credits
 * scale with slots: perSlot × slots. Shows the per-slot rate, the live total for
 * the chosen slots, the brand's balance, and — if short — the max slots they can
 * afford + a Contact-us link. Informational; the actual block lives on the
 * review step's submit button.
 */
export default function CampaignCreditInfo({ perSlot, slots, balance }: {
  perSlot: number | null;
  slots: number;
  balance: number | null;
}) {
  const [, navigate] = useLocation();
  if (perSlot === null) return null; // cost still loading
  const s = Math.max(0, slots || 0);
  const total = perSlot * s;
  const loadingBal = balance === null;
  const bal = balance ?? 0;
  const enough = !loadingBal && bal >= total;
  const maxSlots = perSlot > 0 ? Math.floor(bal / perSlot) : Number.POSITIVE_INFINITY;

  const Contact = () => (
    <button type="button" onClick={() => navigate("/contact-us")}
      className="font-semibold underline underline-offset-2 hover:opacity-80"
      style={{ color: PINK, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: POPPINS }}>
      Contact us
    </button>
  );

  return (
    <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(240,24,122,0.08)", border: "1px solid rgba(240,24,122,0.25)", fontFamily: POPPINS }}>
      <p className="text-white text-sm font-semibold mb-1" style={{ color: PINK }}>
        {perSlot} credit{perSlot === 1 ? "" : "s"} per slot is required to post a campaign.
      </p>
      <p className="text-white/85 text-xs leading-relaxed">
        Total for {s} slot{s === 1 ? "" : "s"}: <span className="font-semibold text-white">{total} credit{total === 1 ? "" : "s"}</span>
        {!loadingBal && <> · Your available credits: <span className="font-semibold text-white">{bal}</span></>}
      </p>
      {!loadingBal && !enough && (
        <p className="text-xs mt-2 leading-relaxed" style={{ color: "#f87171" }}>
          {perSlot > 0 && maxSlots > 0 ? (
            <>Your available credits: {bal}. That's not enough for {total} credits ({s} slots). You can post up to{" "}
              <span className="font-semibold">{maxSlots} slot{maxSlots === 1 ? "" : "s"}</span> with your balance. Want to post {s} slots? <Contact />
            </>
          ) : (
            <>You need at least {perSlot} credit{perSlot === 1 ? "" : "s"} to post 1 slot, but your balance is {bal}. <Contact /></>
          )}
        </p>
      )}
    </div>
  );
}
