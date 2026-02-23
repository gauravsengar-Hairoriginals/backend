import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/enums/user-role.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredPermissions = this.reflector.get<string[]>('permissions', context.getHandler());
        if (!requiredPermissions) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            return false;
        }

        // Super Admin has all permissions
        if (user.role === UserRole.SUPER_ADMIN) {
            return true;
        }

        // Check if user has ALL required permissions
        // (Or ANY? Usually ALL for strict security, but depends on usage. Let's go with ALL for now)
        if (user.permissions?.includes('ALL')) {
            return true;
        }

        return requiredPermissions.every((permission) =>
            user.permissions?.includes(permission)
        );
    }
}
