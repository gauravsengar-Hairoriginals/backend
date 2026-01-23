import { registerAs } from '@nestjs/config';

export default registerAs('shopify', () => ({
    shopUrl: process.env.SHOPIFY_SHOP_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    apiVersion: '2024-01',
}));
