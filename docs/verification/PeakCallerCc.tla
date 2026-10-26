------------------------------ MODULE PeakCallerCc ------------------------------
\* Fixed model of voice/voice-ara.ts hangup CC.
\* emailBrian adds the caller address to _cc only when confirm_lead has
\* set confirmed. log_qualification, book_intro, send_contact, and
\* send_booking_link may store an email and must not set confirmed.
\*
\* The private brain spec was not readable from this environment
\* (brianscottwatson-cell/brain PR 13). This file is the updated model of
\* the fixed code.

EXTENDS Integers

VARIABLES emailLogged, confirmed, ccCaller, mailed

vars == <<emailLogged, confirmed, ccCaller, mailed>>

Init ==
  /\ emailLogged = FALSE
  /\ confirmed = FALSE
  /\ ccCaller = FALSE
  /\ mailed = FALSE

LogEmail ==
  /\ ~mailed
  /\ emailLogged' = TRUE
  /\ UNCHANGED <<confirmed, ccCaller, mailed>>

\* book_intro, send_contact, send_booking_link. They store an email and stop.
Bypass ==
  /\ ~mailed
  /\ emailLogged' = TRUE
  /\ UNCHANGED <<confirmed, ccCaller, mailed>>

Confirm ==
  /\ ~mailed
  /\ confirmed' = TRUE
  /\ UNCHANGED <<emailLogged, ccCaller, mailed>>

\* Hangup summary. CC only when the lead was confirmed and an email is stored.
Hangup ==
  /\ ~mailed
  /\ mailed' = TRUE
  /\ ccCaller' = emailLogged /\ confirmed
  /\ UNCHANGED <<emailLogged, confirmed>>

Next ==
  \/ LogEmail
  \/ Bypass
  \/ Confirm
  \/ Hangup
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

\* A caller who has not confirmed is not copied on the summary.
CcOnlyAfterConfirm == ccCaller => confirmed

=============================================================================
