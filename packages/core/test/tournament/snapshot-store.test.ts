import { InMemorySnapshotStore } from '../../src/index.js';
import { snapshotStoreContract } from './snapshot-store-contract.js';

snapshotStoreContract('em memória', () => new InMemorySnapshotStore());
