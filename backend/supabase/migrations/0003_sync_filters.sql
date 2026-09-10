alter table users add column sync_filters jsonb default '{
  "min_amount": 0,
  "excluded_categories": []
}'::jsonb;