import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoJudgeInviteRepository } from '../src/index.js';
import { judgeInviteRepositoryContract } from '../../core/test/identity/judge-invite-repository-contract.js';
import { awsConfig, testStackOutput } from './aws-env.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
const tableName = await testStackOutput('TournamentsTableName');

judgeInviteRepositoryContract('DynamoDB (tom-test-data)', () => new DynamoJudgeInviteRepository(client, { tableName }));
