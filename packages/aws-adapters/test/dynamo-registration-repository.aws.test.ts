import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoEventRegistry, DynamoRegistrationRepository } from '../src/index.js';
import { registrationRepositoryContract } from '../../core/test/tournament/registration-repository-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('TournamentsTableName');

registrationRepositoryContract('DynamoDB (TomTest)', () => ({
  registry: new DynamoEventRegistry(client, { tableName, retentionDays: 1 }),
  registrations: new DynamoRegistrationRepository(client, { tableName, retentionDays: 1 }),
}));
