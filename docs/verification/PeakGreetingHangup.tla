-------------------------- MODULE PeakGreetingHangup --------------------------
\* Fixed model of voice/voice-ara.ts shouldNotify and the /status handler.
\* A completed call with a known caller id is notified in legacy, agent,
\* and forward_then_agent. A second status event does not send again.
\* A private or missing caller id is not a lead.
\*
\* The private brain spec was not readable from this environment
\* (brianscottwatson-cell/brain PR 13). This file is the updated model of
\* the fixed code.

EXTENDS Integers

VARIABLES mode, fromKnown, completed, emailed, notices

vars == <<mode, fromKnown, completed, emailed, notices>>

Init ==
  /\ mode \in {"legacy", "agent", "forward"}
  /\ fromKnown \in BOOLEAN
  /\ completed = FALSE
  /\ emailed = FALSE
  /\ notices = 0

\* One notice for a known caller id, in every mode.
Hangup ==
  /\ ~completed
  /\ completed' = TRUE
  /\ IF fromKnown THEN
       /\ emailed' = TRUE
       /\ notices' = 1
     ELSE
       UNCHANGED <<emailed, notices>>
  /\ UNCHANGED <<mode, fromKnown>>

\* A repeated status callback must not send a second mail.
Again ==
  /\ completed
  /\ UNCHANGED vars

Next ==
  \/ Hangup
  \/ Again
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

NoLostCaller == (completed /\ fromKnown) => emailed

Once == notices <= 1

=============================================================================
