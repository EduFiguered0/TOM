import type { CfnPolicy, Policy, Role } from 'aws-cdk-lib/aws-iam';

/** Produção ou o gêmeo descartável usado só nos testes reais. */
export type Stage = 'prod' | 'test';

/** Nome legível no console da AWS: tom-<ambiente>-<recurso>, sem os sufixos que o CDK geraria. */
export const nameOf = (stage: Stage, resource: string) => `tom-${stage}-${resource}`;

/** Dá nome à policy que o CDK cria na role com addToPolicy e grant*; chamar depois das permissões. */
export const nameDefaultPolicy = (role: Role, name: string) => {
  const policy = role.node.findChild('DefaultPolicy') as Policy;
  (policy.node.defaultChild as CfnPolicy).policyName = name;
};
