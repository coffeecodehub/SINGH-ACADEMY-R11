# One published review per student

New installations declare a full unique `reviews.user` index named
`one_review_per_student`. The earlier `one_pending_review_per_student` index only
covered pending reviews and did not protect immediately approved submissions.

Existing databases must be inspected before this application version is deployed.
From `backend`, use the existing securely configured database binding:

```sh
node src/scripts/prepareReviewIndexes.js
```

The default is read-only. It reports up to 21 duplicate student IDs and counts,
without printing names, addresses, credentials, or review contents. If duplicate
reviews exist, an administrator must review which approved/rejected record should
remain, preserve required history, and resolve duplicates through a separately
reviewed data operation. This tool never deletes or edits review data.

After reviewing the database target and resolving duplicates, explicitly run:

```sh
node src/scripts/prepareReviewIndexes.js --apply
npm run db:check
```

The apply operation adds the stronger unique index without dropping the earlier
partial index. MongoDB's index build is the final atomic check and rejects any
concurrent duplicate. Production startup verifies the stronger index through the
critical index inventory; it must not be bypassed. No production migration was
executed during implementation.
