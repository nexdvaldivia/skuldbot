import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_revenue_share_tier_lookups')
export class RevenueShareTierLookup extends LookupBaseEntity {}
