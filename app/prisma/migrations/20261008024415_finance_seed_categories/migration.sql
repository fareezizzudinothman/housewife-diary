-- Seed the global finance category catalog (household_id NULL). Global rows
-- are read-only through the API; households add their own categories.
INSERT INTO "finance_categories" ("id", "household_id", "name", "normalized", "type", "icon", "active", "sort_order", "created_at", "updated_at") VALUES
('fcat-inc-salary', NULL, 'Salary', 'salary', 'INCOME', 'wallet', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-inc-bonus', NULL, 'Bonus', 'bonus', 'INCOME', 'star', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-inc-freelance', NULL, 'Freelance', 'freelance', 'INCOME', 'pencil', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-inc-other', NULL, 'Other Income', 'other income', 'INCOME', 'plus', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-groceries', NULL, 'Groceries', 'groceries', 'EXPENSE', 'cart', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-food', NULL, 'Food', 'food', 'EXPENSE', 'utensils', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-utilities', NULL, 'Utilities', 'utilities', 'EXPENSE', 'grid', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-rent', NULL, 'Rent', 'rent', 'EXPENSE', 'home', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-transport', NULL, 'Transport', 'transport', 'EXPENSE', 'map-pin', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-healthcare', NULL, 'Healthcare', 'healthcare', 'EXPENSE', 'alert-circle', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-education', NULL, 'Education', 'education', 'EXPENSE', 'book', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-shopping', NULL, 'Shopping', 'shopping', 'EXPENSE', 'package', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-entertainment', NULL, 'Entertainment', 'entertainment', 'EXPENSE', 'sparkles', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-household', NULL, 'Household', 'household', 'EXPENSE', 'users', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-insurance', NULL, 'Insurance', 'insurance', 'EXPENSE', 'lock', true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-bills', NULL, 'Bills', 'bills', 'EXPENSE', 'calendar', true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('fcat-exp-other', NULL, 'Other', 'other', 'EXPENSE', 'grid', true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
