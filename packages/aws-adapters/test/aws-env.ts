import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

/** Testes reais usam as stacks descartáveis (TomTest, TomAuthTest, TomApiTest). Perfil padrão: tom (sobrescreva com AWS_PROFILE). */
export const awsConfig = { region: 'us-east-2', profile: process.env['AWS_PROFILE'] ?? 'tom' };

export const stackOutput = async (stack: string, key: string): Promise<string> => {
  const cfn = new CloudFormationClient(awsConfig);
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: stack }));
  const value = Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === key)?.OutputValue;
  if (!value) throw new Error(`Output ${key} não encontrado na stack ${stack}. Rode o deploy da infra.`);
  return value;
};

export const testStackOutput = (key: string) => stackOutput('TomTest', key);
