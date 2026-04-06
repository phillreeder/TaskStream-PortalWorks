// import linkedIn selectors

export const workflow = {
  key: "linkedin_navigation_menu_messages",
  async execute(ctx) {
    let query = ctx.registry.resolve('linkedin', 'nav.messaging');
    await ctx.interaction.click(query);
  }
}