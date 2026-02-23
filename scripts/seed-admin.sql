-- Insert admin user into the users table
-- Password hash is bcrypt for: admin123 (change this after first login)
-- Generated with: echo -n 'admin123' | npx bcryptjs hash

INSERT INTO users (
    id,
    phone,
    password_hash,
    name,
    email,
    role,
    is_active,
    is_email_verified,
    is_phone_verified,
    failed_login_attempts,
    permissions,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    '+919999999999',
    '$2b$10$8K1p3UPq1Yd5FXa5dGqVpOQK3aNfFz2GKkHvcQo1g3u3bZqRvFnOe',
    'Admin',
    'admin@hairoriginals.com',
    'SUPER_ADMIN',
    true,
    true,
    true,
    0,
    '[]',
    NOW(),
    NOW()
);
