

export const workflow = {
  key: "linkedin_login",
  async execute(ctx) {
    const { linkedin } = await import("./linkedin.js")
    await linkedin.login(ctx.page)
  }
}