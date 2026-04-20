import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_marketplace_subscription_plan_lookups')
export class MarketplaceSubscriptionPlanLookup extends LookupBaseEntity {}
