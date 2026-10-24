import { InMemoryEventRegistry, InMemoryRegistrationRepository } from '../../src/index.js';
import { registrationRepositoryContract } from './registration-repository-contract.js';

registrationRepositoryContract('em memória', () => {
  const registry = new InMemoryEventRegistry();
  return { registry, registrations: new InMemoryRegistrationRepository(registry) };
});
