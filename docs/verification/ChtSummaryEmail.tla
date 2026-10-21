----------------------------- MODULE ChtSummaryEmail -----------------------------
\* Fixed model of voice/cht/cht-voice.ts emailShop.
\* Stop (stream "stop"), the status callback, and socket flush all call
\* emailShop. The claim is taken before any await. It is cleared only when
\* both Formspree posts fail, so a retry can still send. The recording-ready
\* mail is a separate claim and does not count as a second summary.
\*
\* The private brain spec (brianscottwatson-cell/brain PR 13,
\* verification/grok-bot-flows/) was not readable from this environment.
\* This is the updated model of the fixed code. TLC's before (violation)
\* and after (pass) outputs are in the pull request body.

EXTENDS Integers

CONSTANTS Handlers

VARIABLES emailed, claimed, phase, sends, recordingSends, recordingClaimed

vars == <<emailed, claimed, phase, sends, recordingSends, recordingClaimed>>

Init ==
  /\ emailed = FALSE
  /\ claimed = FALSE
  /\ recordingClaimed = FALSE
  /\ sends = 0
  /\ recordingSends = 0
  /\ phase = [h \in Handlers |-> "idle"]

\* Claim before the posts. A second handler sees claimed and does not enter.
StartSummary(h) ==
  /\ phase[h] = "idle"
  /\ ~emailed
  /\ ~claimed
  /\ claimed' = TRUE
  /\ phase' = [phase EXCEPT ![h] = "posting"]
  /\ UNCHANGED <<emailed, sends, recordingSends, recordingClaimed>>

\* At least one Formspree post succeeded. The claim stays held.
FinishSummaryOk(h) ==
  /\ phase[h] = "posting"
  /\ phase' = [phase EXCEPT ![h] = "done"]
  /\ emailed' = TRUE
  /\ sends' = sends + 1
  /\ UNCHANGED <<claimed, recordingSends, recordingClaimed>>

\* Both posts failed. Release the claim and allow another idle handler to retry.
FinishSummaryFail(h) ==
  /\ phase[h] = "posting"
  /\ phase' = [phase EXCEPT ![h] = "idle"]
  /\ claimed' = FALSE
  /\ UNCHANGED <<emailed, sends, recordingSends, recordingClaimed>>

\* Recording-ready mail. Independent of the summary claim.
StartRecording ==
  /\ ~recordingClaimed
  /\ recordingSends = 0
  /\ recordingClaimed' = TRUE
  /\ UNCHANGED <<emailed, claimed, phase, sends, recordingSends>>

FinishRecording ==
  /\ recordingClaimed
  /\ recordingSends = 0
  /\ recordingSends' = 1
  /\ UNCHANGED <<emailed, claimed, phase, sends, recordingClaimed>>

Next ==
  \/ \E h \in Handlers : StartSummary(h) \/ FinishSummaryOk(h) \/ FinishSummaryFail(h)
  \/ StartRecording
  \/ FinishRecording
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

\* Stop + status + flush cannot each deliver a summary.
AtMostOneSummary == sends <= 1

\* At most one summary is inside the posts.
AtMostOneInFlight ==
  \A h1, h2 \in Handlers :
    (phase[h1] = "posting" /\ phase[h2] = "posting") => h1 = h2

\* A total failure does not leave the flag stuck.
ClaimReleasedOnFailure ==
  claimed => (emailed \/ \E h \in Handlers : phase[h] = "posting")

\* The recording-ready mail is its own single send.
RecordingSeparate == recordingSends <= 1

=============================================================================
