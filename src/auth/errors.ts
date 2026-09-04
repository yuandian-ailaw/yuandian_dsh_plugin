export class AuthenticationRequiredError extends Error {
  constructor() {
    super('尚未选择认证方式，请在设置页使用 OAuth 或配置 API Key')
    this.name = 'AuthenticationRequiredError'
  }
}
