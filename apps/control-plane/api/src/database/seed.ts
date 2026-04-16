/**
 * Database Seed Script
 *
 * Creates initial admin user for the Control-Plane.
 *
 * Usage:
 *   npm run db:migrate
 *   npx ts-node src/database/seed.ts
 *
 * Environment variables required:
 *   - DB_HOST (default: localhost)
 *   - DB_PORT (default: 5432)
 *   - DB_USERNAME (default: skuld)
 *   - DB_PASSWORD (default: skuld)
 *   - DB_DATABASE (default: skuld_controlplane)
 *
 * Default admin credentials (CHANGE IN PRODUCTION):
 *   Email: admin@skuld.io
 *   Password: SkuldAdmin2025!
 */

import { DataSource, In } from 'typeorm';
import * as argon2 from 'argon2';

// Import entities
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { LicenseTypeFeature } from '../licenses/entities/license-type-feature.entity';
import { PaymentConfig, DEFAULT_PAYMENT_CONFIGS } from '../billing/entities/payment-config.entity';
import { LookupDomain } from '../lookups/entities/lookup-domain.entity';
import { LookupValue } from '../lookups/entities/lookup-value.entity';
import {
  LOOKUP_DOMAIN_CLIENT_PLAN,
  LOOKUP_DOMAIN_CLIENT_STATUS,
  LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
  LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
  LOOKUP_DOMAIN_CONTRACT_TYPE,
  LOOKUP_DOMAIN_LICENSE_STATUS,
  LOOKUP_DOMAIN_LICENSE_TYPE,
} from '../lookups/lookups.constants';
import { CP_PERMISSIONS, getRolePermissions } from '../common/authz/permissions';
import { CpPermission } from '../rbac/entities/cp-permission.entity';
import { CpRole, CpRoleScopeType } from '../rbac/entities/cp-role.entity';
import { buildTypeOrmOptions } from './typeorm-options';

// Default admin credentials - CHANGE IN PRODUCTION
const DEFAULT_ADMIN_EMAIL = 'admin@skuld.io';
const DEFAULT_ADMIN_PASSWORD = 'SkuldAdmin2025';
const DEFAULT_ADMIN_FIRST_NAME = 'Skuld';
const DEFAULT_ADMIN_LAST_NAME = 'Administrator';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  // In regulated mode, seed never creates/updates schema.
  // Run migrations first and let seed fail fast if schema is missing.
  const dataSource = new DataSource({
    ...buildTypeOrmOptions(process.env),
    synchronize: false,
    logging: false,
  });

  try {
    // Initialize connection
    await dataSource.initialize();
    console.log('✅ Database connected\n');

    const userRepository = dataSource.getRepository(User);

    // Check if admin already exists
    const existingAdmin = await userRepository.findOne({
      where: { email: DEFAULT_ADMIN_EMAIL },
    });

    if (existingAdmin) {
      console.log(`⚠️  Admin user already exists: ${DEFAULT_ADMIN_EMAIL}`);
      console.log('   Skipping admin creation.\n');
    } else {
      // Hash password
      const passwordHash = await argon2.hash(DEFAULT_ADMIN_PASSWORD);

      // Create admin user
      const admin = userRepository.create({
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        firstName: DEFAULT_ADMIN_FIRST_NAME,
        lastName: DEFAULT_ADMIN_LAST_NAME,
        role: UserRole.SKULD_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      });

      await userRepository.save(admin);

      console.log('✅ Admin user created successfully!\n');
      console.log('   ┌─────────────────────────────────────────┐');
      console.log('   │  CONTROL-PLANE ADMIN CREDENTIALS        │');
      console.log('   ├─────────────────────────────────────────┤');
      console.log(`   │  Email:    ${DEFAULT_ADMIN_EMAIL.padEnd(27)}│`);
      console.log(`   │  Password: ${DEFAULT_ADMIN_PASSWORD.padEnd(27)}│`);
      console.log('   └─────────────────────────────────────────┘');
      console.log('\n   ⚠️  IMPORTANT: Change this password in production!\n');
    }

    // Seed PaymentConfig defaults if not exists
    const paymentConfigRepository = dataSource.getRepository(PaymentConfig);
    const existingConfigs = await paymentConfigRepository.count();

    if (existingConfigs === 0) {
      console.log('📝 Creating default payment configurations...\n');

      for (const config of DEFAULT_PAYMENT_CONFIGS) {
        const paymentConfig = paymentConfigRepository.create({
          productType: config.productType,
          achEnabled: config.achEnabled,
          cardEnabled: config.cardEnabled,
          preferredMethod: config.preferredMethod,
          cardMaxAmountCents: config.cardMaxAmountCents,
          achMinAmountCents: config.achMinAmountCents,
          description: config.description,
        });
        await paymentConfigRepository.save(paymentConfig);
        console.log(
          `   ✓ ${config.productType}: ACH=${config.achEnabled}, Card=${config.cardEnabled}`,
        );
      }

      console.log('\n✅ Payment configurations created\n');
    } else {
      console.log('⚠️  Payment configurations already exist, skipping.\n');
    }

    // Seed RBAC permissions and system roles
    const permissionRepository = dataSource.getRepository(CpPermission);
    const roleRepository = dataSource.getRepository(CpRole);

    const permissionCodes = Object.values(CP_PERMISSIONS);

    for (const code of permissionCodes) {
      const existing = await permissionRepository.findOne({ where: { code } });
      const category = code.split(':')[0] ?? 'general';
      const label = code
        .split(':')
        .join(' ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

      if (!existing) {
        const permission = permissionRepository.create({
          code,
          label,
          category,
          description: `Permission for ${code}`,
          isSystem: true,
        });
        await permissionRepository.save(permission);
      } else {
        existing.label = existing.label || label;
        existing.category = existing.category || category;
        existing.isSystem = true;
        await permissionRepository.save(existing);
      }
    }

    const allPermissions = await permissionRepository.find();
    const permissionByCode = new Map(
      allPermissions.map((permission) => [permission.code, permission]),
    );

    const systemRoleDefinitions: Array<{
      name: UserRole;
      displayName: string;
      description: string;
      permissions: string[];
    }> = [
      {
        name: UserRole.SKULD_ADMIN,
        displayName: 'Skuld Admin',
        description: 'Full control-plane administrative access.',
        permissions: permissionCodes,
      },
      {
        name: UserRole.SKULD_SUPPORT,
        displayName: 'Skuld Support',
        description: 'Operational support access with limited writes.',
        permissions: getRolePermissions(UserRole.SKULD_SUPPORT),
      },
      {
        name: UserRole.CLIENT_ADMIN,
        displayName: 'Client Admin',
        description: 'Admin access scoped to client resources.',
        permissions: getRolePermissions(UserRole.CLIENT_ADMIN),
      },
      {
        name: UserRole.CLIENT_USER,
        displayName: 'Client User',
        description: 'Restricted client user access.',
        permissions: getRolePermissions(UserRole.CLIENT_USER),
      },
    ];

    for (const definition of systemRoleDefinitions) {
      const permissions = definition.permissions
        .map((code) => permissionByCode.get(code))
        .filter((permission): permission is CpPermission => !!permission);

      const existingRole = await roleRepository.findOne({
        where: { name: definition.name },
        relations: ['permissions'],
      });

      if (!existingRole) {
        const role = roleRepository.create({
          name: definition.name,
          displayName: definition.displayName,
          description: definition.description,
          scopeType: CpRoleScopeType.PLATFORM,
          clientId: null,
          isSystem: true,
          isDefault: definition.name === UserRole.CLIENT_USER,
          permissions,
          metadata: {
            source: 'seed',
            legacyRole: definition.name,
          },
        });
        await roleRepository.save(role);
      } else {
        existingRole.displayName = definition.displayName;
        existingRole.description = definition.description;
        existingRole.scopeType = CpRoleScopeType.PLATFORM;
        existingRole.clientId = null;
        existingRole.isSystem = true;
        existingRole.permissions = permissions;
        existingRole.metadata = {
          ...(existingRole.metadata ?? {}),
          legacyRole: definition.name,
        };
        await roleRepository.save(existingRole);
      }
    }

    const systemRoles = await roleRepository.find({
      where: {
        name: In(systemRoleDefinitions.map((definition) => definition.name)),
      },
    });
    const systemRoleByName = new Map(systemRoles.map((role) => [role.name, role]));

    const users = await userRepository.find({ relations: ['roles'] });
    for (const user of users) {
      const mappedRole = systemRoleByName.get(user.role);
      if (!mappedRole) {
        continue;
      }

      const existingRoleIds = new Set((user.roles ?? []).map((role) => role.id));
      if (!existingRoleIds.has(mappedRole.id)) {
        user.roles = [...(user.roles ?? []), mappedRole];
        await userRepository.save(user);
      }
    }

    console.log('✅ RBAC permissions and system roles seeded\n');

    // Seed lookup domains and values
    const lookupDomainRepository = dataSource.getRepository(LookupDomain);
    const lookupValueRepository = dataSource.getRepository(LookupValue);

    const lookupDomains: Array<{
      code: string;
      label: string;
      description: string;
      managedByPortal: 'control_plane' | 'orchestrator';
    }> = [
      {
        code: LOOKUP_DOMAIN_CLIENT_PLAN,
        label: 'Client Plans',
        description: 'Commercial plans for clients.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_CLIENT_STATUS,
        label: 'Client Status',
        description: 'Lifecycle status of clients.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_LICENSE_TYPE,
        label: 'License Types',
        description: 'License catalog for tenant entitlements.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_LICENSE_STATUS,
        label: 'License Status',
        description: 'Runtime status values for licenses.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_CONTRACT_TYPE,
        label: 'Contract Types',
        description: 'Supported legal contract categories.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
        label: 'Contract Jurisdictions',
        description: 'Allowed legal jurisdictions for contracts.',
        managedByPortal: 'control_plane',
      },
      {
        code: LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
        label: 'Contract Compliance Frameworks',
        description: 'Compliance frameworks referenced by contracts.',
        managedByPortal: 'control_plane',
      },
    ];

    for (const domain of lookupDomains) {
      const existing = await lookupDomainRepository.findOne({
        where: { code: domain.code },
      });
      if (!existing) {
        const created = lookupDomainRepository.create({
          ...domain,
          isActive: true,
          isEditable: true,
        });
        await lookupDomainRepository.save(created);
      }
    }

    const domains = await lookupDomainRepository.find();
    const domainByCode = new Map(domains.map((domain) => [domain.code, domain]));

    const lookupValues: Array<{
      domainCode: string;
      code: string;
      label: string;
      sortOrder: number;
      metadata?: Record<string, unknown>;
    }> = [
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_PLAN,
        code: 'free',
        label: 'Free',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      { domainCode: LOOKUP_DOMAIN_CLIENT_PLAN, code: 'starter', label: 'Starter', sortOrder: 20 },
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_PLAN,
        code: 'professional',
        label: 'Professional',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_PLAN,
        code: 'enterprise',
        label: 'Enterprise',
        sortOrder: 40,
      },
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_STATUS,
        code: 'pending',
        label: 'Pending',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      { domainCode: LOOKUP_DOMAIN_CLIENT_STATUS, code: 'active', label: 'Active', sortOrder: 20 },
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_STATUS,
        code: 'suspended',
        label: 'Suspended',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_CLIENT_STATUS,
        code: 'canceled',
        label: 'Canceled',
        sortOrder: 40,
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_TYPE,
        code: 'trial',
        label: 'Trial',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_TYPE,
        code: 'standard',
        label: 'Standard',
        sortOrder: 20,
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_TYPE,
        code: 'professional',
        label: 'Professional',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_TYPE,
        code: 'enterprise',
        label: 'Enterprise',
        sortOrder: 40,
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_STATUS,
        code: 'active',
        label: 'Active',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_STATUS,
        code: 'expired',
        label: 'Expired',
        sortOrder: 20,
        metadata: { blocksUsage: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_STATUS,
        code: 'revoked',
        label: 'Revoked',
        sortOrder: 30,
        metadata: { blocksUsage: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_LICENSE_STATUS,
        code: 'suspended',
        label: 'Suspended',
        sortOrder: 40,
        metadata: { blocksUsage: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'msa',
        label: 'Master Service Agreement',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'tos',
        label: 'Terms of Service',
        sortOrder: 20,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'dpa',
        label: 'Data Processing Agreement',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'sla',
        label: 'Service Level Agreement',
        sortOrder: 40,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'baa',
        label: 'Business Associate Agreement',
        sortOrder: 50,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_TYPE,
        code: 'nda',
        label: 'Non-Disclosure Agreement',
        sortOrder: 60,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
        code: 'us_delaware',
        label: 'Delaware, USA',
        sortOrder: 10,
        metadata: { isDefault: true },
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
        code: 'us_california',
        label: 'California, USA',
        sortOrder: 20,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
        code: 'us_texas',
        label: 'Texas, USA',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_JURISDICTION,
        code: 'eu_ireland',
        label: 'Ireland (EU)',
        sortOrder: 40,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
        code: 'hipaa',
        label: 'HIPAA',
        sortOrder: 10,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
        code: 'soc2',
        label: 'SOC 2',
        sortOrder: 20,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
        code: 'gdpr',
        label: 'GDPR',
        sortOrder: 30,
      },
      {
        domainCode: LOOKUP_DOMAIN_CONTRACT_COMPLIANCE_FRAMEWORK,
        code: 'pci_dss',
        label: 'PCI DSS',
        sortOrder: 40,
      },
    ];

    for (const value of lookupValues) {
      const domain = domainByCode.get(value.domainCode);
      if (!domain) {
        continue;
      }

      const existing = await lookupValueRepository.findOne({
        where: { domainId: domain.id, code: value.code },
      });
      if (existing) {
        continue;
      }

      const created = lookupValueRepository.create({
        domainId: domain.id,
        code: value.code,
        label: value.label,
        sortOrder: value.sortOrder,
        isActive: true,
        metadata: value.metadata ?? {},
      });
      await lookupValueRepository.save(created);
    }

    const licenseTypeFeatureRepository = dataSource.getRepository(LicenseTypeFeature);
    const licenseTypeDomain = domainByCode.get(LOOKUP_DOMAIN_LICENSE_TYPE);
    const licenseTypeValues = licenseTypeDomain
      ? await lookupValueRepository.find({
          where: { domainId: licenseTypeDomain.id },
        })
      : [];
    const licenseTypeByCode = new Map(licenseTypeValues.map((value) => [value.code, value]));

    const featureTemplateByType: Record<string, Record<string, number | boolean>> = {
      trial: {
        maxBots: 3,
        maxRunners: 1,
        maxConcurrentRuns: 1,
        maxRunsPerMonth: 100,
        aiAssistant: false,
        customNodes: false,
        apiAccess: false,
        sso: false,
        auditLog: false,
        prioritySupport: false,
      },
      standard: {
        maxBots: 10,
        maxRunners: 3,
        maxConcurrentRuns: 3,
        maxRunsPerMonth: 1000,
        aiAssistant: true,
        customNodes: false,
        apiAccess: true,
        sso: false,
        auditLog: true,
        prioritySupport: false,
      },
      professional: {
        maxBots: 50,
        maxRunners: 10,
        maxConcurrentRuns: 10,
        maxRunsPerMonth: 10000,
        aiAssistant: true,
        customNodes: true,
        apiAccess: true,
        sso: true,
        auditLog: true,
        prioritySupport: false,
      },
      enterprise: {
        maxBots: -1,
        maxRunners: -1,
        maxConcurrentRuns: -1,
        maxRunsPerMonth: -1,
        aiAssistant: true,
        customNodes: true,
        apiAccess: true,
        sso: true,
        auditLog: true,
        prioritySupport: true,
      },
    };

    for (const [licenseTypeCode, features] of Object.entries(featureTemplateByType)) {
      const lookupValue = licenseTypeByCode.get(licenseTypeCode);
      if (!lookupValue) {
        continue;
      }

      for (const [featureKey, rawValue] of Object.entries(features)) {
        const existing = await licenseTypeFeatureRepository.findOne({
          where: {
            licenseTypeLookupValueId: lookupValue.id,
            featureKey,
          },
        });
        if (existing) {
          continue;
        }

        const isBoolean = typeof rawValue === 'boolean';
        const created = licenseTypeFeatureRepository.create({
          licenseTypeLookupValueId: lookupValue.id,
          featureKey,
          valueType: isBoolean ? 'boolean' : 'number',
          booleanValue: isBoolean ? rawValue : null,
          numberValue: isBoolean ? null : Number(rawValue),
          isActive: true,
        });
        await licenseTypeFeatureRepository.save(created);
      }
    }
    console.log('✅ License type feature templates seeded\n');
    console.log('✅ Lookup domains and values seeded\n');

    console.log('🎉 Seed completed successfully!\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run seed
seed();
