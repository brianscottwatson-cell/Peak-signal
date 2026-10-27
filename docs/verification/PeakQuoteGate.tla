------------------------------ MODULE PeakQuoteGate ------------------------------
\* Model of quote-mode dialing in voice/peak/peak-outbound.ts.
\* A quote dial needs the outbound gate, one live approval for that attempt,
\* the allowlist, and a number that is not on the do-not-call list.
\* The approval moves to used and cannot place a second quote call.
\* Booking does not need an approval token. A do-not-call number is not
\* dialed in either mode.

EXTENDS Integers

VARIABLES enabled, mode, allowlisted, dnc, token, quoteDials, bookDials

vars == <<enabled, mode, allowlisted, dnc, token, quoteDials, bookDials>>

Init ==
  /\ enabled \in BOOLEAN
  /\ mode \in {"book", "quote"}
  /\ allowlisted \in BOOLEAN
  /\ dnc \in BOOLEAN
  /\ token = "none"
  /\ quoteDials = 0
  /\ bookDials = 0

Issue ==
  /\ mode = "quote"
  /\ token = "none"
  /\ ~dnc
  /\ allowlisted
  /\ token' = "live"
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, quoteDials, bookDials>>

Expire ==
  /\ token = "live"
  /\ token' = "expired"
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, quoteDials, bookDials>>

QuoteDial ==
  /\ enabled
  /\ mode = "quote"
  /\ token = "live"
  /\ allowlisted
  /\ ~dnc
  /\ token' = "used"
  /\ quoteDials' = quoteDials + 1
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, bookDials>>

BookDial ==
  /\ enabled
  /\ mode = "book"
  /\ ~dnc
  /\ bookDials < 2
  /\ bookDials' = bookDials + 1
  /\ UNCHANGED <<enabled, mode, allowlisted, dnc, token, quoteDials>>

Next ==
  \/ Issue
  \/ Expire
  \/ QuoteDial
  \/ BookDial
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

QuoteNeedsLiveToken == (quoteDials > 0) => (token = "used" /\ allowlisted /\ ~dnc /\ enabled)

OneQuoteUse == quoteDials <= 1

DncNeverDials == dnc => (quoteDials = 0 /\ bookDials = 0)

BookingSkipsToken == (bookDials > 0) => (enabled /\ ~dnc)

=============================================================================
