----------------------------- MODULE PeakFormspree -----------------------------
\* Fixed model of voice/voice-ara.ts postPeakForm, emailBrian, and fileAssessment.
\* A non-2xx response does not latch emailed. The GitHub backup is skipped
\* for the peak persona only when the email post succeeded. Legacy still
\* writes the backup after a successful email. A failed post can be retried.
\*
\* The private brain spec was not readable from this environment
\* (brianscottwatson-cell/brain PR 13). This file is the updated model of
\* the fixed code.

CONSTANTS Peak

VARIABLES phase, postOk, emailed, github

vars == <<phase, postOk, emailed, github>>

Init ==
  /\ phase = "idle"
  /\ postOk = FALSE
  /\ emailed = FALSE
  /\ github = FALSE

Start ==
  /\ phase = "idle"
  /\ phase' = "posting"
  /\ UNCHANGED <<postOk, emailed, github>>

\* ok is the HTTP result. emailed follows it. The backup is written when
\* the post failed, and also when it succeeded outside the peak persona.
Finish ==
  \E ok \in BOOLEAN :
    /\ phase = "posting"
    /\ phase' = "done"
    /\ postOk' = ok
    /\ emailed' = ok
    /\ github' = (github \/ (~ok) \/ (~Peak))

\* A failed post leaves emailed false, so another attempt can run.
Retry ==
  /\ phase = "done"
  /\ ~emailed
  /\ phase' = "posting"
  /\ UNCHANGED <<postOk, emailed, github>>

Next ==
  \/ Start
  \/ Finish
  \/ Retry
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

\* Non-2xx is not sent, and a failed post does not skip the backup.
HonestSend ==
  (phase = "done") => ((emailed = postOk) /\ ((~postOk) => github))

=============================================================================
