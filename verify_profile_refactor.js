const crypto = require('crypto');

const API_URL = 'http://localhost:8082/api/v1';

async function verify() {
    try {
        const timestamp = Date.now();
        const email = `verify_user_${timestamp}@example.com`;
        const phone = `999${String(timestamp).slice(-7)}`;
        const password = 'password123';

        console.log(`Registering user: ${email} / ${phone}`);

        // 1. Register
        const registerRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Verify User',
                email,
                phone,
                password,
                role: 'stylist'
            })
        });

        if (!registerRes.ok) {
            const error = await registerRes.text();
            throw new Error(`Registration failed: ${registerRes.status} ${error}`);
        }
        console.log('User registered.');

        // 2. Login
        console.log('Logging in...');
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!loginRes.ok) {
            const error = await loginRes.text();
            throw new Error(`Login failed: ${loginRes.status} ${error}`);
        }

        const loginData = await loginRes.json();
        const token = loginData.accessToken;

        if (!token) throw new Error('No access token returned');
        console.log('Login successful.');

        // 3. Update Profile
        console.log('Updating stylist profile with salon details...');
        const salonName = `Test Salon ${timestamp}`;
        const ownerPhone = `888${String(timestamp).slice(-7)}`;

        const updateRes = await fetch(`${API_URL}/profile/stylist`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                salonName,
                salonAddress: '123 Test St',
                salonCity: 'Test City',
                salonState: 'Test State',
                salonPincode: '123456',
                ownerName: 'Test Owner',
                ownerPhone,
                latitude: 12.345678,
                longitude: 76.543210
            })
        });

        if (!updateRes.ok) {
            const error = await updateRes.text();
            throw new Error(`Update profile failed: ${updateRes.status} ${error}`);
        }
        console.log('Profile updated.');

        // 4. Get Profile
        console.log('Fetching profile to verify salon details...');
        const getRes = await fetch(`${API_URL}/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!getRes.ok) {
            const error = await getRes.text();
            throw new Error(`Get profile failed: ${getRes.status} ${error}`);
        }

        const profileData = await getRes.json();
        const retrievedSalonName = profileData.stylistProfile?.salonName;

        if (retrievedSalonName === salonName) {
            console.log(`SUCCESS: Retrieved salon name matches: ${retrievedSalonName}`);
        } else {
            console.error(`FAILURE: Expected '${salonName}', got '${retrievedSalonName}'`);
            console.log('Full response:', JSON.stringify(profileData, null, 2));
            process.exit(1);
        }

    } catch (error) {
        console.error('Verification failed:', error.message);
        process.exit(1);
    }
}

verify();
