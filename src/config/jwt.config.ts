import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRY || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
}));