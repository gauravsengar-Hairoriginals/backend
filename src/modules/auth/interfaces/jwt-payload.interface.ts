export interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    permissions?: string[];
    iat?: number;
    exp?: number;
}
