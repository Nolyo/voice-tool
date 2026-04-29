-- Index supporting the daily purge cron's range scan on requested_at.
--
-- The scheduled Edge Function `purge-account-deletions` runs:
--   delete from public.account_deletion_requests where requested_at < <cutoff>
-- which today triggers a full table scan. Once volume grows, this becomes the
-- bottleneck of the daily job. requested_at is monotonic (defaulted to now())
-- so a btree index is the natural fit.
--
-- Source: docs/superpowers/plans/2026-04-26-v3-post-review-fixes.md (Task 14, Step 5).

create index if not exists account_deletion_requests_requested_at_idx
  on public.account_deletion_requests (requested_at);
