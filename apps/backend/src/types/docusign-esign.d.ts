declare module 'docusign-esign' {
  export class ApiClient {
    setOAuthBasePath(basePath: string): void;
    setBasePath(basePath: string): void;
    addDefaultHeader(name: string, value: string): void;
    requestJWTUserToken(
      clientId: string,
      userId: string,
      scopes: string,
      rsaPrivateKey: string,
      expiresIn: number
    ): Promise<{ body: { access_token: string; expires_in: number } }>;
  }

  export class EnvelopesApi {
    constructor(apiClient: ApiClient);
    createEnvelope(
      accountId: string,
      opts: { envelopeDefinition: EnvelopeDefinition }
    ): Promise<{ body: EnvelopeSummary }>;
    getDocument(
      accountId: string,
      envelopeId: string,
      documentId: string,
      opts: Record<string, unknown>
    ): Promise<{ body: Buffer | string | { data: string } }>;
  }

  export interface EnvelopeDefinition {
    templateId?: string;
    status?: string;
    templateRoles?: TemplateRole[];
  }

  export interface TemplateRole {
    roleName?: string;
    email?: string;
    name?: string;
    routingOrder?: string;
    tabs?: { textTabs?: TextTab[] };
  }

  export interface TextTab {
    tabLabel?: string;
    value?: string;
  }

  export interface EnvelopeSummary {
    envelopeId?: string;
  }
}
