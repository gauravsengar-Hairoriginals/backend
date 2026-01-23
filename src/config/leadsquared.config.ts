import { registerAs } from '@nestjs/config';

export default registerAs('leadsquared', () => ({
    apiKey: process.env.LEADSQUARED_API_KEY,
    secretKey: process.env.LEADSQUARED_SECRET_KEY,
    host: process.env.LEADSQUARED_HOST || 'https://api.leadsquared.com',
}));
