# Shared alerts and action feedback — R10

The site now uses one scoped feedback family for user and admin action results. `FeedbackNotice` provides success, error, warning, info and confirmation icons, titles and messages. It remains inline for form validation, retry controls and saved results; loading, upload progress and stored record content retain their existing presentation. Server-confirmed administrative save acknowledgements remain visible until dismissed.

`FeedbackDialog` uses the browser's native dialog top layer, unique labelled titles/descriptions, a focus loop, opener restoration, Escape/backdrop cancellation, scroll locking and reduced-motion styling. Existing CMS save confirmations, business form dialogs and billing consent cards reuse it. Immediate purchase cancellation retains the original acknowledgement and separate review/confirmation steps. Opening or dismissing these cards does not mutate billing.

Opening and closing animate smoothly where the browser supports native discrete display/overlay transitions. The outgoing native dialog is the same DOM node; it closes immediately to release modality, focus and scrolling, then remains inert and hidden from accessibility APIs for its 180 ms visual exit. It cannot dispatch another click or form action. Reduced motion, unsupported native transitions and account/route invalidation remove the presentation immediately. Decisions and business actions settle immediately; only presentation of the next queued decision waits for an outgoing exit.

`FeedbackPresence` keeps a conditional dialog or editor at its original caller position while it exits. It does not move or clone contextful React children. Local boundaries cover conditional business dialogs and CMS save-confirmation ancestors; their upload/form contexts and original identifiers remain intact. A logically closed editor's dirty/unload guard deactivates immediately, even while its inert outgoing presentation remains. A synchronous authoritative scope marker prevents cleanup from explicitly restoring focus to an old account or route when that discarded child has not rerendered.

Ordinary business forms retain their R9 `bizModal`/`bizModalWide`, sticky `bizModalHead` and `bizModalBody` markup and original white/Arial chrome, dimensions, spacing, colors and mobile rules. They reuse native lifecycle/accessibility behavior through a custom-header slot. The new feedback title and focus theme is scoped away from those forms; action notices inside them still use the requested shared feedback family.

`lib/feedback.ts` queues decisions and exposes `confirm`, `prompt` and `alert`. A duplicate pending decision cannot authorize a second action. Cancel, aborted requests, missing hosts and owner/route changes fail closed. The host hides a mismatched request during render and checks its scope again when resolving, before passive-effect cleanup. Account and route scope are supplied by the root account feedback wrapper.

All 18 former application `confirm()` calls have been migrated. The shared CMS close helper and all five consumers now await decisions. Lesson links, Back and logout also await the same leave guard. Post-decision checks reject stale records, newer drafts, busy uploads, unmounted editors or changed accounts. Existing action URLs, payloads, password/acknowledgement requirements and billing owner/in-flight fences remain in their action owners.

Browser-native `beforeunload` protection is retained in the lesson leave guard, CMS dirty helper and business portal. Browsers cannot wait for a custom modal while closing or reloading a document.

Validation performed before root integration:

- Nine focused frontend test files passed, including the new queue/modal and CMS stale-draft guard tests, billing consent adapters, answer navigation, admin save acknowledgement, review moderation, exports and auth Back behavior.
- The shared modal tests exercise top-layer opening, Tab/Shift+Tab, Escape, busy dismissal, backdrop hit testing, scroll restoration and focus restoration. Queue tests cover duplicate requests, ordered decisions, prompt cancellation versus empty input, aborts and scope changes before effect cleanup.
- The browser answer-navigation spec now expects the themed dialog, focus containment and Cancel/Escape behavior, and checks that no application native dialog is used. Review-moderation browser consent also targets the shared dialog.
- A TypeScript AST audit found zero application native `alert`, `confirm` or `prompt` calls under `frontend/app`, `frontend/components` and `frontend/lib`. Syntax transpilation and scoped whitespace checks passed.

Full type checks, release build and browser execution are handled by the root integration task. No backend, schema, environment or persisted data changes were needed for this task.

The separate exit-animation pass passed a full frontend TypeScript check and 13 targeted regression files. New pure/native lifecycle checks cover outgoing identity, queued successors, reduced motion, immediate focus/scroll release, noninteractive exit state and authoritative scope cleanup. A real React rendering test checks contextful form children. Six actual-browser cases in `themed-feedback-exit-r10.spec.ts` cover Cancel/Escape, same-node retention, immediate single dispatch with a held response, reduced motion and account/route aborts; the root task runs these after rebuilding.
