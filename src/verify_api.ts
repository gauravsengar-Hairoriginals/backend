import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

async function testApi() {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin12@hairoriginals.com',
            password: 'admin123'
        });
        const token = loginRes.data.accessToken;
        console.log('Login successful. Token obtained.');

        console.log('Fetching stylists...');
        const stylistsRes = await axios.get(`${API_URL}/admin/stylists`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('Stylists API Response Status:', stylistsRes.status);
        console.log('Stylists Data:', JSON.stringify(stylistsRes.data, null, 2));

    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testApi();
