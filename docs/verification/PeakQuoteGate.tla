------------------------------ MODULE PeakQuoteGate ------------------------------
\* Model of quote-mode dialing in voice/peak/peak-outbound.ts.
\* A quote dial needs the outbound gate, one live approval for that attempt,
\* a plan that matches the dial, the allowlist, and a number that is not on
\* the do-not-call list.
\* The approval moves to used and cannot place a second quote call.
\* Booking does not need an approval token or a plan. A do-not-call number
\* is not dialed in either mode.

EXTENDS Integers

VARIABLES enabled, mode, allowlisted, dnc, token, planMatch, quoteDials, bookDials

vars == <<enabled, mode, allowlisted, dnc, token, planMatch, quoteDials, bookDials>>

Init ==
  /\ enabled \in BOOLEAN
  /\ mode \in {"book", "quote"}
  /\ allowlisted \in BOOLEAN
  /\ dnc \in BOOLEAN
  /\ token = "none"
  /\ planMatch \in BOOLEAN
  /\ quoteDials = 0
  /\ bookDials = 0

Issue ==
  /\ mode = "quote"
  /\ token = "none"
  /\ ~dnc
  /\ allowlisted
  /\ token' = "live"
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, planMatch, quoteDials, bookDials>>

Expire ==
  /\ token = "live"
  /\ token' = "expired"
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, planMatch, quoteDials, bookDials>>

QuoteDial ==
  /\ enabled
  /\ mode = "quote"
  /\ token = "live"
  /\ planMatch
  /\ allowlisted
  /\ ~dnc
  /\ token' = "used"
  /\ quoteDials' = quoteDials + 1
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, planMatch, bookDials>>

BookDial ==
  /\ enabled
  /\ mode = "book"
  /\ ~dnc
  /\ bookDials < 2
  /\ bookDials' = bookDials + 1
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, token, planMatch, quoteDials>>

Next ==
  \/ Issue
  \/ Expire
  \/ QuoteDial
  \/ BookDial
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

QuoteNeedsLiveToken == (quoteDials > 0) => (token = "used" /\ planMatch /\ allowlisted /\ ~dnc /\ enabled)

QuoteNeedsPlan == (quoteDials > 0) => planMatch

OneQuoteUse == quoteDials <= 1

DncNeverDials == dnc => (quoteDials = 0 /\ bookDials = 0)

BookingSkipsToken == (bookDials > 0) => (enabled /\ ~dnc)

=============================================================================
