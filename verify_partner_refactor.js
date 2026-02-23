const fetch = require('node-fetch');

const API_URL = 'http://localhost:8082/api/v1';

async function verify() {
    try {
        const timestamp = Date.now();
        const fieldAgentEmail = `fa_${timestamp}@example.com`;
        const fieldAgentPhone = `91${String(timestamp).slice(-8)}`;
        const ownerEmail = `owner_${timestamp}@example.com`;
        const ownerPhone = `98${String(timestamp).slice(-8)}`; // Different prefix
        const stylistPhone = `97${String(timestamp).slice(-8)}`;
        const password = 'password123';

        console.log('--- Starting Partner Refactor Verification ---');

        // 1. Register Field Agent
        console.log(`1. Registering Field Agent: ${fieldAgentEmail}`);
        const faRegRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Field Agent',
                email: fieldAgentEmail,
                phone: fieldAgentPhone,
                password,
                role: 'FIELD_AGENT'
            })
        });
        if (!faRegRes.ok) throw new Error(`FA Register failed: ${await faRegRes.text()}`);

        // 2. Login Field Agent
        console.log('2. Logging in Field Agent...');
        const faLoginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fieldAgentEmail, password })
        });
        if (!faLoginRes.ok) throw new Error(`FA Login failed: ${await faLoginRes.text()}`);
        const faToken = (await faLoginRes.json()).accessToken;

        // 3. Register Salon Owner (so they exist in the system)
        console.log(`3. Registering Salon Owner: ${ownerEmail}`);
        const ownerRegRes = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Salon Owner',
                email: ownerEmail,
                phone: ownerPhone,
                password,
                role: 'SALON_OWNER'
            })
        });
        // Note: owner registration might fail if we are strictly using OTP flow in some envs, but here standard register seems open.
        // If it fails, we might need to rely on Salon creation creating the owner?
        // SalonsService.create checks if owner exists by phone, if not creates. 
        // So we can skip explicit registration if we want, but better to register to set password known to us.
        if (!ownerRegRes.ok) console.log(`Owner Register warning (might be ok if auto-created later): ${await ownerRegRes.text()}`);

        // 4. Create Salon (as Field Agent) linked to Owner
        console.log('4. Creating Salon as Field Agent...');
        const salonRes = await fetch(`${API_URL}/salons`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${faToken}`
            },
            body: JSON.stringify({
                name: `Partner Test Salon ${timestamp}`,
                ownerName: 'Test Salon Owner',
                ownerPhone: ownerPhone, // This links the salon to our owner user
                address: '123 Partner St',
                city: 'Partner City',
                level: 'GOLD'
            })
        });
        if (!salonRes.ok) throw new Error(`Salon Create failed: ${await salonRes.text()}`);
        const salon = await salonRes.json();
        console.log(`   Salon created: ${salon.id}`);

        // 5. Login as Salon Owner
        console.log('5. Logging in as Salon Owner...');
        const ownerLoginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ownerEmail, password })
        });
        if (!ownerLoginRes.ok) throw new Error(`Owner Login failed: ${await ownerLoginRes.text()}`);
        const ownerToken = (await ownerLoginRes.json()).accessToken;

        // 6. Verify Dashboard access
        console.log('6. specific Checking Partner Dashboard...');
        const dashboardRes = await fetch(`${API_URL}/partner/dashboard`, {
            headers: { 'Authorization': `Bearer ${ownerToken}` }
        });
        if (!dashboardRes.ok) throw new Error(`Dashboard access failed: ${await dashboardRes.text()}`);
        const dashboard = await dashboardRes.json();
        if (dashboard.totalSalons < 1) throw new Error('Dashboard shows 0 salons!');
        console.log('   Dashboard access verified.');

        // 7. Add Stylist (Partner API)
        console.log(`7. Adding Stylist via Partner API: ${stylistPhone}`);
        const addRes = await fetch(`${API_URL}/partner/salons/${salon.id}/stylists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                name: 'New Partner Stylist',
                phone: stylistPhone
            })
        });
        if (!addRes.ok) throw new Error(`Add Stylist failed: ${await addRes.text()}`);
        const addedStylist = await addRes.json();
        console.log(`   Stylist added: ${addedStylist.id}`);

        // 8. Remove Stylist (Partner API - NEW)
        console.log('8. Removing Stylist via Partner API...');
        const removeRes = await fetch(`${API_URL}/partner/salons/${salon.id}/stylists/${addedStylist.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });
        if (!removeRes.ok) throw new Error(`Remove Stylist failed: ${await removeRes.text()}`);
        console.log('   Stylist removed successfully.');

        // 9. Add Stylist via Salon API (Direct Access Check)
        console.log('9. Adding Stylist via Salons API directly...');
        const directAddRes = await fetch(`${API_URL}/salons/${salon.id}/stylists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                name: 'Direct Salon API Stylist',
                phone: `96${String(Date.now()).slice(-8)}`
            })
        });
        if (!directAddRes.ok) throw new Error(`Direct Add Stylist failed: ${await directAddRes.text()}`);
        const directAddedStylist = await directAddRes.json();
        console.log(`   Stylist added via Salon API: ${directAddedStylist.id}`);

        // 10. Remove Stylist via Salon API (Direct Access Check)
        console.log('10. Removing Stylist via Salons API directly...');
        const directRemoveRes = await fetch(`${API_URL}/salons/${salon.id}/stylists/${directAddedStylist.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });
        if (!directRemoveRes.ok) throw new Error(`Direct Remove Stylist failed: ${await directRemoveRes.text()}`);
        console.log('   Stylist removed via Salon API successfully.');

        console.log('--- SUCCESS: Partner API Refactor & Salon API Roles Verified ---');

    } catch (error) {
        console.error('--- FAILURE ---');
        console.error(error.message);
        process.exit(1);
    }
}

verify();
