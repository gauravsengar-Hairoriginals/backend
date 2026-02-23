const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
require('dotenv').config();

// Configuration from .env
const SHOP = process.env.SHOPIFY_SHOP_URL;
const API_KEY = process.env.SHOPIFY_CLIENT_ID;
const API_SECRET = process.env.SHOPIFY_SECRET;
const SCOPES = 'read_products,write_products,read_customers,write_customers,read_orders,write_orders,read_price_rules,write_price_rules,read_discounts,write_discounts';
const REDIRECT_URI = 'http://localhost:4000/callback';
const NONCE = crypto.randomBytes(16).toString('hex');

if (!SHOP || !API_KEY || !API_SECRET) {
    console.error('❌ Error: Missing Shopify credentials in .env file');
    console.error('   Required: SHOPIFY_SHOP_URL, SHOPIFY_CLIENT_ID, SHOPIFY_SECRET');
    process.exit(1);
}

console.log(`\n📋 Using credentials from .env:`);
console.log(`   Shop: ${SHOP}`);
console.log(`   Client ID: ${API_KEY}`);
console.log(`   Secret: ${API_SECRET.substring(0, 10)}...`);

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const queryObject = parsedUrl.query;

    // Step 1: Show the install link
    if (pathname === '/') {
        const installUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${NONCE}`;

        console.log(`\n🔗 Install URL generated. Waiting for authorization...`);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Shopify Token Generator</title></head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                <h1>🔐 Shopify Token Generator</h1>
                <p>Click the button below to authorize and generate your access token:</p>
                <a href="${installUrl}" style="display: inline-block; background: #008060; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px;">
                    Authorize with Shopify
                </a>
                <p style="margin-top: 20px; color: #666; font-size: 14px;">
                    After authorization, your token will appear here and in the terminal.
                </p>
            </body>
            </html>
        `);
    }
    // Step 2: Handle the callback
    else if (pathname === '/callback') {
        const { code, state, shop } = queryObject;

        console.log(`\n📥 Received callback from Shopify`);
        console.log(`   Shop: ${shop}`);
        console.log(`   Code: ${code}`);

        if (state !== NONCE) {
            console.error('❌ State mismatch - possible CSRF attack');
            res.writeHead(403, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: State verification failed</h1>');
            return;
        }

        // Exchange code for access token
        const postData = JSON.stringify({
            client_id: API_KEY,
            client_secret: API_SECRET,
            code: code,
        });

        const options = {
            hostname: shop,
            port: 443,
            path: '/admin/oauth/access_token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        console.log(`\n🔄 Exchanging code for access token...`);

        const request = https.request(options, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const result = JSON.parse(data);

                    if (result.access_token) {
                        console.log(`\n${'='.repeat(60)}`);
                        console.log(`✅ SUCCESS! Your new access token is:`);
                        console.log(`\n   ${result.access_token}`);
                        console.log(`\n${'='.repeat(60)}`);
                        console.log(`\n📝 Update your .env file with:`);
                        console.log(`   SHOPIFY_ACCESS_TOKEN=${result.access_token}`);
                        console.log(`\n🛑 You can now close this terminal (Ctrl+C)\n`);

                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
                            <!DOCTYPE html>
                            <html>
                            <head><title>Success!</title></head>
                            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                                <h1 style="color: #008060;">✅ Success!</h1>
                                <p>Your access token has been generated:</p>
                                <textarea style="width: 100%; height: 80px; font-family: monospace; padding: 10px;" readonly>${result.access_token}</textarea>
                                <p style="margin-top: 20px;"><strong>Next steps:</strong></p>
                                <ol>
                                    <li>Copy the token above</li>
                                    <li>Update <code>SHOPIFY_ACCESS_TOKEN</code> in your <code>.env</code> file</li>
                                    <li>Close this browser tab</li>
                                    <li>Press Ctrl+C in the terminal to stop this script</li>
                                </ol>
                            </body>
                            </html>
                        `);
                    } else {
                        console.error('❌ Failed to get token:', result);
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Error</h1><pre>${JSON.stringify(result, null, 2)}</pre>`);
                    }
                } catch (e) {
                    console.error('❌ Error parsing response:', e, data);
                    res.writeHead(500, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Error parsing response</h1><pre>${data}</pre>`);
                }
            });
        });

        request.on('error', (e) => {
            console.error('❌ Request error:', e);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Request Error</h1><pre>${e.message}</pre>`);
        });

        request.write(postData);
        request.end();
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`
${'='.repeat(60)}
🚀 Shopify Token Generator Started!
${'='.repeat(60)}

1. Open your browser to: http://localhost:${PORT}
2. Click "Authorize with Shopify"
3. Log in to Shopify and approve the app
4. Your token will be displayed here

⏳ Waiting for you to open the browser...
`);
});
