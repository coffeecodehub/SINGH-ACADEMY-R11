# R5 administrative Excel CSV downloads

The existing admin theme and tables remain. Added export buttons download every
matching record across all pages as UTF-8 CSV with a BOM. Excel can open/import
these files; they are not `.xlsx` workbooks. Current search/status/date filters
are sent without table pagination or caller-selected field projections.

| Workspace | Export | Authorization |
| --- | --- | --- |
| Students | Existing all-student register | Client Admin and Super Admin |
| Form submissions | Contact enquiries, including message/status | Client Admin |
| Course purchases | Individual course invoice totals and access dates | Client Admin |
| Course purchases, separate section button | Section purchase invoices using the same search/status/date filters | Client Admin |
| Student subscriptions | Plan terms, dates and recorded term prices | Client Admin |
| Reviews | Review text, rating and effective approval visibility | Client Admin and Super Admin |
| Certificates | Completion/certificate register; no PDFs or verification tokens | Client Admin |
| Completion notifications | Academy completion notification types only | Client Admin |
| Enrollment purchase requests | Existing request status, requested item and contact details | Client Admin |

The existing business financial record/report exports remain available where
those older workspaces are enabled, with their existing authorization and
explicit 5,000-row guard. The new R5 dataset exports stream with a 500-record
cursor batch and do not impose a page or record-count cap. Student search in
purchase/subscription exports uses a projected database join rather than a
truncated list of matching user IDs.

Every new export checks the authenticated role, uses an explicit output column
list, emits `private, no-store`, audits the request and completed row count, and
closes its cursor when the client disconnects. Passwords, reset/session tokens,
provider secrets, certificate bytes and certificate verification tokens are
excluded. Text beginning with spreadsheet formula syntax is prefixed as text;
quotes, commas and newlines are quoted as CSV. Downloads are fenced to the admin
session that requested them; account changes cannot download an earlier session's
completed export.

No export edits the underlying users, enquiries, paid access or financial rows.
