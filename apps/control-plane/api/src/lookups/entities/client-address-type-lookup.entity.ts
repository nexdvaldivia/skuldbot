import { Entity } from 'typeorm';
import { LookupBaseEntity } from './lookup-base.entity';

@Entity('cp_client_address_type_lookups')
export class ClientAddressTypeLookup extends LookupBaseEntity {}
