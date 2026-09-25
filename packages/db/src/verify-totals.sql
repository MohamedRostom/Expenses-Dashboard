-- T114: per-user sanity check — expense count and total spend in each user's own default
-- currency (amount_default is already in that currency; converting again would double-convert).
-- Ignores conversion nuance deliberately: this is a quick pre/post-restore or pre/post-cutover
-- row-count-and-total comparison, not a financial reconciliation.
select
  u.id as user_id,
  u.email,
  u.default_currency,
  count(e.id) filter (where e.deleted_at is null) as expense_count,
  coalesce(sum(e.amount_default) filter (where e.deleted_at is null), 0) as total_minor
from users u
left join expenses e on e.user_id = u.id
group by u.id, u.email, u.default_currency
order by u.email;
