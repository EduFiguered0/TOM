import { InMemoryEventStore } from '../../src/index.js';
import { eventStoreContract } from './event-store-contract.js';

eventStoreContract('em memória', () => new InMemoryEventStore());
