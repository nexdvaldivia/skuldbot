import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { UserLoginHistory } from '../users/entities/user-login-history.entity';
import { UserPasswordHistory } from '../users/entities/user-password-history.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MfaService } from './mfa.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserLoginHistory, UserPasswordHistory]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'change-this-secret'),
        signOptions: {
          expiresIn: 900, // 15 minutes
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, JwtStrategy],
  exports: [AuthService, MfaService, JwtStrategy, PassportModule],
})
export class AuthModule {}
