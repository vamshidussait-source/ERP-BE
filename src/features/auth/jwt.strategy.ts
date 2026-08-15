import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        'JWT_SECRET environment variable is required. ' +
          'Set a long, random, unique value in your .env file.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  /**
   * Passport calls validate() after verifying the JWT signature and expiry.
   * The returned value is attached to request.user.
   *
   * The payload is either a regular tenant-scoped user JWT (JwtPayload, with
   * tenantId/tenantSchema claims) or a platform admin JWT
   * (PlatformAdminJwtPayload, with no tenant claims) — both token kinds share
   * this strategy and secret.
   */
  validate(payload: AuthenticatedUser): AuthenticatedUser {
    return payload;
  }
}
