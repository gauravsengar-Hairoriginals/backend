-- Create a default 10% commission rule
INSERT INTO commission_rules (
    id, 
    name, 
    type, 
    value, 
    min_order_amount, 
    is_active, 
    priority
) VALUES (
    gen_random_uuid(), 
    'Standard 10% Commission', 
    'percentage', 
    10.00, 
    0, 
    true, 
    0
);
