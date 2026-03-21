import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody:true saves raw buffer; bodyParser:false lets us control parsing per-route
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false });

  // ── Custom body parsers ─────────────────────────────────────────────────
  // lead-push: CRM sends form-encoded body with wrong Content-Type (application/json).
  // Read it as raw text so the JSON parser never sees it.
  app.use('/api/v1/facebook/lead-push', (req: any, _res: any, next: any) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      req.body    = data;          // raw string — controller reads this
      req.rawBody = Buffer.from(data);
      next();
    });
  });

  // ── Shopify webhook: capture raw body BEFORE express.json() touches it ─────
  // Shopify HMAC must be computed on the EXACT bytes sent — not on the parsed JSON.
  app.use('/api/v1/shopify/webhook', (req: any, _res: any, next: any) => {
    let raw = Buffer.alloc(0);
    req.on('data', (chunk: Buffer) => { raw = Buffer.concat([raw, chunk]); });
    req.on('end', () => {
      req.rawBody = raw;
      req.body    = JSON.parse(raw.toString('utf8') || '{}');
      next();
    });
  });

  // All other routes: standard JSON + urlencoded
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));


  // CORS — allow all origins in development
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security — disable headers that conflict with cross-origin API calls
  app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  }));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Hair Originals Backend API')
    .setDescription(
      'Central backend platform for Hair Originals operations - integrating Shopify, LeadSquared, and powering Field Force & Stylist Loyalty apps.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
🚀 Hair Originals Backend is running!
📍 Server:    http://localhost:${port}
📚 Swagger:   http://localhost:${port}/api/docs
🔑 Health:    http://localhost:${port}/health
  `);
}

bootstrap();
