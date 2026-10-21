--------------------------- MODULE ChtFallbackNotice ---------------------------
\* Fixed model of the CHT no-realtime-key path in voice/cht/cht-voice.ts.
\* The fallback route sends one missed-call notice when the caller id is
\* known. The status callback does not send a second one. A private caller
\* id is not a notice.
\*
\* The private brain spec was not readable from this environment
\* (brianscottwatson-cell/brain PR 13). This file is the updated model of
\* the fixed code.

EXTENDS Integers

VARIABLES fromKnown, fallbackDone, statusDone, notices

vars == <<fromKnown, fallbackDone, statusDone, notices>>

Init ==
  /\ fromKnown \in BOOLEAN
  /\ fallbackDone = FALSE
  /\ statusDone = FALSE
  /\ notices = 0

\* Claim and send in one step when the caller id is known.
Fallback ==
  /\ ~fallbackDone
  /\ fallbackDone' = TRUE
  /\ IF fromKnown THEN notices' = 1 ELSE UNCHANGED notices
  /\ UNCHANGED <<fromKnown, statusDone>>

\* Status retries only when the fallback sent nothing.
Status ==
  /\ fallbackDone
  /\ ~statusDone
  /\ statusDone' = TRUE
  /\ IF fromKnown /\ notices = 0 THEN notices' = 1 ELSE UNCHANGED notices
  /\ UNCHANGED <<fromKnown, fallbackDone>>

Next ==
  \/ Fallback
  \/ Status
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

Notified == fallbackDone => (fromKnown <=> (notices = 1))

Once == notices <= 1

=============================================================================
